"""ROR affiliation matching — free, no auth.

Bridges CORDIS org names → ROR ID → OpenAlex institution (all OpenAlex
institutions carry a ROR ID). Uses the ROR affiliation-matching API.
"""
import time

import requests

_cache: dict[str, str | None] = {}
_ROR_URL = "https://api.ror.org/v2/organizations"
_RETRIES = 3


class RorUnavailable(Exception):
    """ROR could not be asked (rate limit, outage, timeout). Not the same as
    "ROR found no match": the caller must not treat it as a rejection."""


def _fetch(name: str) -> dict:
    last = None
    for attempt in range(_RETRIES):
        try:
            r = requests.get(_ROR_URL, params={"affiliation": name}, timeout=10)
        except requests.RequestException as e:
            last = type(e).__name__
        else:
            if r.status_code == 200:
                return r.json()
            last = f"HTTP {r.status_code}"
            if r.status_code not in (429, 500, 502, 503, 504):
                break  # a 4xx other than 429 won't change on retry
            if r.status_code == 429:
                try:
                    time.sleep(min(float(r.headers.get("Retry-After", 0)), 60))
                except ValueError:
                    pass
        time.sleep(2 * 2 ** attempt)  # 2 s, 4 s, 8 s
    raise RorUnavailable(last)


def match_to_ror(name: str, country: str | None = None) -> str | None:
    """Return a ROR ID (e.g. 'https://ror.org/02catss52') or None when ROR has
    no confident match. Raises RorUnavailable when ROR could not answer; that
    result is not cached, so the next org with the same name asks again."""
    key = f"{name}|{country}"
    if key in _cache:
        return _cache[key]

    data = _fetch(name)

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
