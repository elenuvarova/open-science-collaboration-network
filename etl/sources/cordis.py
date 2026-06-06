"""CORDIS source — free bulk CSV download (CC BY 4.0, no auth).

Downloads Horizon Europe + H2020 ZIPs, reads project.csv + organization.csv,
filters to climate-related projects by EuroSciVoc / topic keywords.
"""
import io
import os
import re
import zipfile

import pandas as pd
import requests

import config

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".cache")

CLIMATE_KEYWORDS = [
    "climate adapt", "climate resilien", "flood", "drought", "heat wave",
    "coastal adapt", "urban heat", "sea level", "extreme weather",
    "climate change adapt",
]


def _download_zip(url: str, label: str) -> bytes:
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(CACHE_DIR, f"cordis_{label}.zip")
    if os.path.exists(cache_file):
        print(f"  cordis: using cached {label}")
        with open(cache_file, "rb") as f:
            return f.read()
    print(f"  cordis: downloading {label} ({url})…")
    r = requests.get(url, timeout=120, stream=True)
    r.raise_for_status()
    # Cap the download so a runaway/corrupted upstream can't OOM the shared
    # container (the ETL runs in-process alongside the API).
    max_bytes = 500 * 1024 * 1024
    chunks, total = [], 0
    for chunk in r.iter_content(chunk_size=1 << 20):
        total += len(chunk)
        if total > max_bytes:
            raise ValueError(f"cordis: {label} exceeded {max_bytes // (1024*1024)} MB download cap")
        chunks.append(chunk)
    data = b"".join(chunks)
    with open(cache_file, "wb") as f:
        f.write(data)
    return data


def _read_csv_from_zip(data: bytes, filename: str) -> pd.DataFrame:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        match = next((n for n in names if n.endswith(filename)), None)
        if match is None:
            raise FileNotFoundError(f"{filename} not in ZIP. Files: {names[:10]}")
        # Guard against a zip bomb before decompressing the member into pandas.
        if z.getinfo(match).file_size > 1024 * 1024 * 1024:
            raise ValueError(f"cordis: {match} uncompressed size exceeds 1 GB cap")
        with z.open(match) as f:
            return pd.read_csv(
                f, sep=";", encoding="utf-8-sig",
                low_memory=False, on_bad_lines="skip",
            )


def fetch_projects():
    """Yield dicts: {cordis_id, title, abstract, programme, countries[], participants[]}.

    participants: list of {name, country, role}
    """
    for label, url in config.CORDIS_DATASETS.items():
        try:
            data = _download_zip(url, label)
        except Exception as e:
            print(f"  cordis: WARN — could not download {label}: {e}")
            continue

        try:
            projects = _read_csv_from_zip(data, "project.csv")
            orgs = _read_csv_from_zip(data, "organization.csv")
        except Exception as e:
            print(f"  cordis: WARN — could not parse {label}: {e}")
            continue

        # Normalise column names (CORDIS uses different names per programme)
        projects.columns = projects.columns.str.strip().str.lower()
        orgs.columns = orgs.columns.str.strip().str.lower()

        # Rename common variations
        for col_map in [
            ("rcn", "id"), ("projectid", "id"), ("projectrcn", "id"),
            ("shortname", "acronym"),
            ("objective", "objective"),
        ]:
            old, new = col_map
            if old in projects.columns and new not in projects.columns:
                projects = projects.rename(columns={old: new})

        for col_map in [
            ("projectrcn", "projectid"), ("projectid", "projectid"),
            ("name", "name"), ("shortname", "name"),
            ("country", "country"), ("activitytype", "role"),
        ]:
            old, new = col_map
            if old in orgs.columns and new not in orgs.columns:
                orgs = orgs.rename(columns={old: new})

        id_col = "id" if "id" in projects.columns else projects.columns[0]

        # Vectorised keyword filter — 100x faster than apply(axis=1) on 50k rows
        def _col(df, name):
            return df[name].fillna("").str.lower() if name in df.columns else pd.Series("", index=df.index)

        text_series = (
            _col(projects, "objective") + " " +
            _col(projects, "title") + " " +
            _col(projects, "topics") + " " +
            _col(projects, "euroscivoc")
        )
        # Escape keywords — they're literal substrings, not regex (a stray "+" or
        # "(" in a future keyword would otherwise break or silently mis-filter).
        pattern = "|".join(re.escape(kw) for kw in CLIMATE_KEYWORDS)
        climate = projects[text_series.str.contains(pattern, na=False, regex=True)].copy()
        print(f"  cordis: {label} — {len(climate)} matching projects (of {len(projects)})")

        org_lookup = {}
        if "projectid" in orgs.columns:
            for pid, group in orgs.groupby("projectid"):
                org_lookup[str(pid)] = group

        for _, row in climate.iterrows():
            pid = str(row.get(id_col, ""))
            participants = []
            for _, org in org_lookup.get(pid, pd.DataFrame()).iterrows():
                name = str(org.get("name") or org.get("shortname") or "").strip()
                country = str(org.get("country", "")).strip().upper()[:2]
                role = str(org.get("role") or org.get("activitytype") or "participant").lower()
                role = "coordinator" if "coord" in role else "participant"
                if name:
                    participants.append({"name": name, "country": country, "role": role})

            countries = list({p["country"] for p in participants if p["country"]})

            yield {
                "cordis_id": pid,
                "title": str(row.get("title", "") or ""),
                "abstract": str(row.get("objective", "") or ""),
                "programme": label,
                "countries": countries,
                "participants": participants,
            }
