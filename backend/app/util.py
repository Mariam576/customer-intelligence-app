"""Small helpers shared by the API modules."""

from __future__ import annotations

import json

import pandas as pd


def records(frame: pd.DataFrame) -> list[dict]:
    """DataFrame -> list of plain dicts that are always valid JSON.

    Going through pandas' own JSON writer turns NumPy numbers into Python
    numbers, NaN into null and timestamps into ISO strings.
    """
    return json.loads(frame.to_json(orient="records", date_format="iso"))
