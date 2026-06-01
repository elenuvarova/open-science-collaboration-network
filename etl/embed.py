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
GROQ_MODEL = "llama-3.3-70b-versatile"
TOP_INST = 12
TOP_WORKS = 15


def _embedder():
    from fastembed import TextEmbedding
    return TextEmbedding(model_name=EMBED_MODEL)


def embed_topic(db, topic_name: str) -> None:
    topic = db.query(Topic).filter_by(name=topic_name).first()
    if not topic:
        print(f"  embed: topic '{topic_name}' not found, skipping")
        return

    works = db.query(Work).filter_by(topic_id=topic.id).all()
    texts_with_meta = [
        (w.id, w, f"{w.title or ''} {w.abstract or ''}".strip())
        for w in works if w.title
    ]

    # ── 1. Embeddings ────────────────────────────────────────────────────────
    id_to_vec: dict[int, list] = {}
    work_objs_ordered: list = []

    if texts_with_meta:
        model = _embedder()
        ids, work_objs_ordered, docs = zip(*texts_with_meta)
        print(f"  embed: encoding {len(docs)} works…")
        vecs = list(model.embed(list(docs)))

        for work_id, vec in zip(ids, vecs):
            id_to_vec[work_id] = vec.tolist()
            existing = db.query(WorkEmbedding).filter_by(work_id=work_id).first()
            if existing:
                existing.embedding = id_to_vec[work_id]
            else:
                db.add(WorkEmbedding(work_id=work_id, embedding=id_to_vec[work_id]))
        db.flush()
        print(f"  embed: {len(vecs)} embeddings stored")

        # Rank works by cosine similarity to topic query
        topic_query = f"{topic.name} {' '.join(topic.keywords or [])}"
        q_vec = np.array(next(model.embed([topic_query])))
        mat = np.array(vecs)
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        sims = (mat / np.maximum(norms, 1e-9)) @ q_vec
        top_idxs = np.argsort(-sims)[:TOP_WORKS]
        relevant_works = [work_objs_ordered[i] for i in top_idxs]
    else:
        # Fallback: top by citations
        relevant_works = sorted(works, key=lambda w: w.cited_by_count or 0, reverse=True)[:TOP_WORKS]
        print(f"  embed: no embeddable works, using citation fallback")

    # ── 2. Brief generation ──────────────────────────────────────────────────
    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key:
        print("  embed: GROQ_API_KEY not set — skipping brief generation")
        return

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
        f"{context}"
    )

    try:
        from groq import Groq
        client = Groq(api_key=groq_key)
        resp = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=900,
            temperature=0.4,
        )
        brief_text = resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"  embed: Groq error: {e}")
        return

    now = datetime.now(timezone.utc).isoformat()
    existing = db.query(TopicBrief).filter_by(topic_id=topic.id).first()
    if existing:
        existing.text = brief_text
        existing.generated_at = now
        existing.model = GROQ_MODEL
    else:
        db.add(TopicBrief(
            topic_id=topic.id,
            text=brief_text,
            generated_at=now,
            model=GROQ_MODEL,
        ))
    db.flush()
    print(f"  embed: brief generated ({len(brief_text)} chars, model={GROQ_MODEL})")
