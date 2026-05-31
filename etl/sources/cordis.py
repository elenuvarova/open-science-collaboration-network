"""CORDIS source — free bulk CSV download (CC BY 4.0, no auth).

Downloads Horizon Europe + H2020 ZIPs, reads project.csv + organization.csv,
filters to climate-related projects by EuroSciVoc / topic keywords.
"""
import io
import os
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
    data = r.content
    with open(cache_file, "wb") as f:
        f.write(data)
    return data


def _read_csv_from_zip(data: bytes, filename: str) -> pd.DataFrame:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        match = next((n for n in names if n.endswith(filename)), None)
        if match is None:
            raise FileNotFoundError(f"{filename} not in ZIP. Files: {names[:10]}")
        with z.open(match) as f:
            return pd.read_csv(f, sep=";", encoding="utf-8-sig", low_memory=False)


def _is_climate_related(row) -> bool:
    text = " ".join([
        str(row.get("objective", "") or ""),
        str(row.get("title", "") or ""),
        str(row.get("topics", "") or ""),
        str(row.get("euroSciVoc", "") or ""),
    ]).lower()
    return any(kw in text for kw in CLIMATE_KEYWORDS)


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
        climate = projects[projects.apply(_is_climate_related, axis=1)].copy()
        print(f"  cordis: {label} — {len(climate)} climate-related projects (of {len(projects)})")

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
