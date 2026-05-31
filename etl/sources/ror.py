"""ROR affiliation matching — free, no auth.

Bridges CORDIS org names → ROR ID → OpenAlex institution (all OpenAlex
institutions carry a ROR ID). Uses the ROR affiliation-matching API.
"""
import time

import requests

_cache: dict[str, str | None] = {}
_ROR_URL = "https://api.ror.org/v2/organizations"


def match_to_ror(name: str, country: str | None = None) -> str | None:
    """Return a ROR ID (e.g. 'https://ror.org/02catss52') or None."""
    key = f"{name}|{country}"
    if key in _cache:
        return _cache[key]

    params = {"affiliation": name}
    try:
        r = requests.get(_ROR_URL, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
    except Exception:
        _cache[key] = None
        return None

    time.sleep(0.05)  # ROR asks for polite rate

    for item in data.get("items", []):
        if not item.get("chosen"):
            continue
        org = item.get("organization", {})
        ror_id = org.get("id")
        if not ror_id:
            continue
        # Optional: filter by country if provided
        if country:
            addresses = org.get("locations", [])
            org_country = None
            for loc in addresses:
                org_country = loc.get("geonames_details", {}).get("country_code")
                if org_country:
                    break
            if org_country and org_country.upper() != country.upper():
                _cache[key] = None
                return None
        _cache[key] = ror_id
        return ror_id

    _cache[key] = None
    return None
