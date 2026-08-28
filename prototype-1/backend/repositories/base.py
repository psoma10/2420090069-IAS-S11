"""Shared repository helpers.

Repositories are the only place in CyberVault that issues SQL. Everything
above them works with plain dictionaries, so a change of database engine stops
at this layer.

Two rules hold everywhere in this package:

1. Every value reaching SQL goes through a parameter placeholder. No query is
   ever built by string concatenation or f-string interpolation of user input.
2. Column and table names that vary at runtime (sort keys, filter columns) are
   validated against an allow-list before they are interpolated, never taken
   from the request directly.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

ISO_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def iso(value: Any) -> Any:
    """Render a datetime as an ISO-8601 UTC string with a trailing ``Z``.

    API_CONTRACT.md section 6 promises this shape. Non-datetime values pass
    through untouched so this can be applied to a whole row safely.
    """
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).strftime(ISO_FORMAT)
    return value


def serialize(row: dict | None, *, drop: tuple[str, ...] = ()) -> dict | None:
    """Convert a database row into an API-safe dictionary.

    Datetimes become ISO strings, and any column named in ``drop`` is removed —
    used to keep ``password_hash`` and ``encryption_key`` out of responses.
    """
    if row is None:
        return None
    return {k: iso(v) for k, v in row.items() if k not in drop}


def serialize_many(rows: list[dict], *, drop: tuple[str, ...] = ()) -> list[dict]:
    return [serialize(row, drop=drop) for row in rows]


def clamp_limit(limit: Any, *, default: int = 50, maximum: int = 200) -> int:
    """Coerce a client-supplied limit into a sane range.

    A caller asking for a million rows gets ``maximum``, not an error and not a
    million rows.
    """
    try:
        value = int(limit)
    except (TypeError, ValueError):
        return default
    return max(1, min(value, maximum))


def clamp_offset(offset: Any) -> int:
    try:
        value = int(offset)
    except (TypeError, ValueError):
        return 0
    return max(0, value)
