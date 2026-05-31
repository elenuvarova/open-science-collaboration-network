"""Organisation-name normalisation — the cleanup before fuzzy matching.

Lowercase, strip accents, drop legal suffixes (GmbH/SA/Ltd/e.V./SRL), standardise
University/Università/Universität/Université, collapse whitespace.
"""
import re
import unicodedata

LEGAL_SUFFIXES = [
    "gmbh", "ltd", "limited", "inc", "llc", "sa", "srl", "spa", "bv", "nv",
    "e.v.", "ev", "plc", "ab", "oy", "as", "sas", "sl",
]
UNIVERSITY_VARIANTS = ["università", "universität", "université", "universiteit", "universidad"]


def normalize_name(name: str) -> str:
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = s.lower().strip()
    for variant in UNIVERSITY_VARIANTS:
        s = s.replace(variant, "university")
    s = re.sub(r"[.,/()]", " ", s)
    tokens = [t for t in s.split() if t not in LEGAL_SUFFIXES]
    return re.sub(r"\s+", " ", " ".join(tokens)).strip()
