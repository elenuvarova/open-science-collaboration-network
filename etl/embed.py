"""Step 7: embed work abstracts with all-MiniLM-L6-v2 (via fastembed / ONNX),
then generate a topic strategy brief using Groq.

Stores:
  work_embedding  — 384-dim embedding per work (JSON array)
  topic_brief     — Groq-generated brief text + metadata
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import numpy as np

from _db import SessionLocal
from models import Institution, InstitutionMetric, Topic, TopicBrief, Work, WorkEmbedding

EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
# Groq retires models without notice (llama-3.3-70b-versatile disappeared in
# Aug 2026 and briefs silently stopped refreshing). GROQ_MODEL overrides; otherwise
# take the first of these that the account can actually see.
GROQ_PREFERRED = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"]


def _pick_groq_model(api_key: str) -> str:
    override = os.environ.get("GROQ_MODEL")
    if override:
        return override
    try:
        import requests
        r = requests.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=20,
        )
        r.raise_for_status()
        available = {m["id"] for m in r.json().get("data", [])}
        for model in GROQ_PREFERRED:
            if model in available:
                return model
        print(f"  embed: none of {GROQ_PREFERRED} available on Groq; trying the first anyway")
    except Exception as e:  # noqa: BLE001
        print(f"  embed: could not list Groq models ({e}); using {GROQ_PREFERRED[0]}")
    return GROQ_PREFERRED[0]


def _clean_brief(text: str) -> str:
    """Normalise model Markdown: '**## Heading**' → '## Heading', trim."""
    import re
    text = re.sub(r"^\s*\*\*\s*(#{2,3}\s*[^*\n]+?)\s*\*\*\s*$", r"\1", text, flags=re.M)
    return text.strip()


def _groq_brief(prompt: str):
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None, None
    model = _pick_groq_model(key)
    from groq import Groq
    kwargs = dict(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        # Reasoning models spend completion tokens thinking before they answer,
        # so the old 900-token cap left the content empty.
        max_completion_tokens=3000,
    )
    if model.startswith("openai/gpt-oss"):
        kwargs["reasoning_effort"] = "low"
    resp = Groq(api_key=key).chat.completions.create(**kwargs)
    return resp.choices[0].message.content or "", model


GEMINI_PREFERRED = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-pro-latest"]


def _gemini_brief(prompt: str):
    """Google Gemini (free tier) via REST — the fallback when Groq is down or
    has retired its models. Tries the preferred models in order, moving on when
    one is overloaded (503) or rate-limited (429)."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None, None
    import time

    import requests
    base = "https://generativelanguage.googleapis.com/v1beta"
    headers = {"x-goog-api-key": key}
    if os.environ.get("GEMINI_MODEL"):
        candidates = [os.environ["GEMINI_MODEL"]]
    else:
        listed = requests.get(f"{base}/models", headers=headers, timeout=20)
        listed.raise_for_status()
        usable = [m["name"].split("/", 1)[1] for m in listed.json().get("models", [])
                  if "generateContent" in m.get("supportedGenerationMethods", [])]
        candidates = [m for m in GEMINI_PREFERRED if m in usable] or [m for m in usable if "flash" in m][:2]
    last_error = None
    for model in candidates:
        for attempt in range(2):
            r = requests.post(
                f"{base}/models/{model}:generateContent",
                headers=headers,
                json={"contents": [{"parts": [{"text": prompt}]}],
                      "generationConfig": {"temperature": 0.3, "maxOutputTokens": 8192}},  # thinking models spend part of it
                timeout=120,
            )
            if r.status_code in (429, 500, 503):        # busy: wait, retry once
                last_error = f"{model}: HTTP {r.status_code}"
                time.sleep(3 * (attempt + 1))
                continue
            if r.status_code != 200:                     # e.g. 404 not enabled for this key
                last_error = f"{model}: HTTP {r.status_code}"
                break
            parts = r.json()["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts)
            if len(text.strip()) >= 1200:
                return text, f"gemini/{model}"
            last_error = f"{model}: short answer ({len(text)} chars)"
            break
    raise RuntimeError(f"all Gemini models busy ({last_error})")


def _generate_brief(prompt: str):
    """Try each configured provider in turn; return (text, model) or (None, None).
    Loud on failure: a stale brief used to fail silently for weeks."""
    for provider in (_groq_brief, _gemini_brief):
        try:
            text, model = provider(prompt)
        except Exception as e:  # noqa: BLE001
            print(f"  embed: {provider.__name__} failed: {e}")
            continue
        if model is None:
            continue
        text = _clean_brief(text)
        # A 350–450-word brief is ~2,000+ characters; anything far shorter was cut off.
        if len(text) >= 1200:
            return text, model
        print(f"  embed: {model} returned a too-short brief ({len(text)} chars)")
    print("  embed: BRIEF NOT UPDATED — no provider produced a usable brief")
    return None, None
TOP_INST = 12
TOP_WORKS = 15


def _embedder():
    from fastembed import TextEmbedding
    return TextEmbedding(model_name=EMBED_MODEL)


def embed_topic(db, topic_name: str) -> bool:
    """Embed new works and regenerate the brief. Returns True when a brief was written."""
    topic = db.query(Topic).filter_by(name=topic_name).first()
    if not topic:
        print(f"  embed: topic '{topic_name}' not found, skipping")
        return False

    works = db.query(Work).filter_by(topic_id=topic.id).all()
    texts_with_meta = [
        (w.id, w, f"{w.title or ''} {w.abstract or ''}".strip())
        for w in works if w.title
    ]

    # ── 1. Embeddings ────────────────────────────────────────────────────────
    # id → (work_obj, embedding_vector)
    id_to_work: dict[int, object] = {w_id: w for w_id, w, _ in texts_with_meta}
    id_to_vec: dict[int, list] = {}

    if texts_with_meta:
        # Skip works already embedded — speeds up re-runs significantly
        all_work_ids = [w_id for w_id, _, _ in texts_with_meta]
        already_rows = db.query(WorkEmbedding).filter(
            WorkEmbedding.work_id.in_(all_work_ids)
        ).all()
        already_embedded = {row.work_id: row.embedding for row in already_rows}
        id_to_vec.update(already_embedded)

        new_texts = [(w_id, w, t) for w_id, w, t in texts_with_meta if w_id not in already_embedded]
        print(f"  embed: {len(already_embedded)} already embedded, {len(new_texts)} new to encode")

        model = None
        if new_texts:
            model = _embedder()
            new_ids, _, new_docs = zip(*new_texts)
            print(f"  embed: encoding {len(new_docs)} works…")
            new_vecs = list(model.embed(list(new_docs)))
            for work_id, vec in zip(new_ids, new_vecs):
                vec_list = vec.tolist()
                id_to_vec[work_id] = vec_list
                db.add(WorkEmbedding(work_id=work_id, embedding=vec_list))
            db.flush()
            print(f"  embed: {len(new_vecs)} new embeddings stored")

        # Rank ALL embedded works by cosine similarity to topic query
        if id_to_vec:
            if model is None:
                model = _embedder()
            topic_query = f"{topic.name} {' '.join(topic.keywords or [])}"
            q_vec = np.array(next(model.embed([topic_query])))
            ranked_ids = list(id_to_vec.keys())
            mat = np.array([id_to_vec[i] for i in ranked_ids])
            norms = np.linalg.norm(mat, axis=1, keepdims=True)
            sims = (mat / np.maximum(norms, 1e-9)) @ q_vec
            top_idxs = np.argsort(-sims)[:TOP_WORKS]
            relevant_works = [id_to_work[ranked_ids[i]] for i in top_idxs if ranked_ids[i] in id_to_work]
            stale = sum(1 for i in top_idxs if ranked_ids[i] not in id_to_work)
            if stale:
                print(f"  embed: {stale} stale embedding IDs skipped in ranking")
        else:
            relevant_works = sorted(works, key=lambda w: w.cited_by_count or 0, reverse=True)[:TOP_WORKS]
    else:
        # Fallback: top by citations
        relevant_works = sorted(works, key=lambda w: w.cited_by_count or 0, reverse=True)[:TOP_WORKS]
        print(f"  embed: no embeddable works, using citation fallback")

    # ── 2. Brief generation ──────────────────────────────────────────────────
    if not (os.environ.get("GROQ_API_KEY") or os.environ.get("GEMINI_API_KEY")):
        print("  embed: neither GROQ_API_KEY nor GEMINI_API_KEY set — skipping brief generation")
        return False

    top_insts = (
        db.query(InstitutionMetric, Institution)
        .join(Institution, InstitutionMetric.institution_id == Institution.id)
        .filter(InstitutionMetric.topic_id == topic.id)
        .order_by(InstitutionMetric.partner_fit_score.desc())
        .limit(TOP_INST)
        .all()
    )
    inst_lines = [
        f"- {inst.name} ({inst.country or '?'}, {inst.type or '?'}): "
        f"fit={m.partner_fit_score:.0f}/100, EU projects={m.eu_projects}, "
        f"works={m.recent_works}"
        for m, inst in top_insts
    ]
    work_lines = [
        f"- {w.title} ({w.year or '?'}): {(w.abstract or '')[:180].replace(chr(10), ' ')}…"
        for w in relevant_works if w.title
    ]

    context = "\n".join([
        f"TOPIC: {topic.name}",
        f"KEYWORDS: {', '.join(topic.keywords or [])}",
        "",
        f"TOP PARTNER INSTITUTIONS (ranked by Partner Fit Score):",
        *inst_lines,
        "",
        f"MOST RELEVANT RESEARCH WORKS:",
        *work_lines,
    ])

    prompt = (
        "You are an expert in EU research funding and consortium building.\n\n"
        "Generate a concise strategic partner brief (350–450 words) for a research team "
        "planning to submit an EU Horizon Europe grant proposal. Use the context below.\n\n"
        "Structure your brief with exactly these four sections:\n"
        "## Topic landscape\n"
        "## Recommended partners\n"
        "## Consortium composition\n"
        "## EU funding context\n\n"
        "Be specific: name institutions, mention their country and type, reference actual "
        "EU project counts where relevant. Write in clear professional English.\n\n"
        "Hard rules:\n"
        "- Use ONLY facts present in the context. Do not invent budgets, euro amounts, "
        "work-programme names, call identifiers, dates or statistics.\n"
        "- If the context doesn't say something, leave it out rather than guess.\n"
        "- At most 450 words. Plain Markdown: each section starts with a line '## Heading' "
        "(no bold around headings), short paragraphs or '- ' bullet lists. "
        "No tables, no horizontal rules.\n\n"
        f"{context}"
    )

    brief_text, model = _generate_brief(prompt)
    if not brief_text:
        return False

    now = datetime.now(timezone.utc).isoformat()
    existing = db.query(TopicBrief).filter_by(topic_id=topic.id).first()
    if existing:
        existing.text = brief_text
        existing.generated_at = now
        existing.model = model
    else:
        db.add(TopicBrief(
            topic_id=topic.id,
            text=brief_text,
            generated_at=now,
            model=model,
        ))
    db.flush()
    print(f"  embed: brief generated ({len(brief_text)} chars, model={model})")
    return True
