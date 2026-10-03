"""Shared bounds for query and path parameters.

Every id column is a 32-bit INTEGER: a larger number used to reach the database
and come back as a 500 (and a traceback in the logs). Bounding it here turns
that into a plain 422 before any query runs.
"""
from typing import Annotated, Optional

from fastapi import HTTPException, Path, Query

INT4_MAX = 2_147_483_647

TopicId = Annotated[int, Query(ge=1, le=INT4_MAX)]
OptTopicId = Annotated[Optional[int], Query(ge=1, le=INT4_MAX)]
InstitutionId = Annotated[int, Path(ge=1, le=INT4_MAX)]
# Institution types are lower-case words (education, public_body…).
InstType = Annotated[Optional[str], Query(max_length=32, pattern=r"^[a-z_]+$")]


def parse_ids(raw: str, max_ids: int) -> list[int]:
    """'3,1,3' -> [1, 3]: distinct, sorted, each a valid id, at most max_ids."""
    try:
        ids = sorted({int(x) for x in raw.split(",") if x.strip()})
    except ValueError:
        raise HTTPException(status_code=422, detail="ids must be comma-separated integers")
    if not ids:
        raise HTTPException(status_code=422, detail="ids must not be empty")
    if len(ids) > max_ids:
        raise HTTPException(status_code=422, detail=f"at most {max_ids} ids")
    if ids[0] < 1 or ids[-1] > INT4_MAX:
        raise HTTPException(status_code=422, detail="ids out of range")
    return ids
