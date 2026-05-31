"""ROR source — free affiliation matching (ror.org).

Bridges CORDIS org names → ROR ID → OpenAlex institution (OpenAlex institutions
all carry a ROR ID). Use the free ROR affiliation-matching API.

TODO (Phase 2):
  - GET https://api.ror.org/organizations?affiliation=<name>
  - take the top chosen=true match above a confidence threshold
  - return ror_id or None
"""


def match_to_ror(name: str, country: str | None = None) -> str | None:
    """Resolve an organisation name to a ROR ID. STUB — Phase 2."""
    raise NotImplementedError("ror.match_to_ror — implement in Phase 2")
