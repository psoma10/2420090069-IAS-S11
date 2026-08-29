"""Response envelope builders.

Every route returns one of these two shapes, so the frontend can branch on a
single predictable structure. See API_CONTRACT.md section 1.
"""

from __future__ import annotations

from typing import Any

from flask import jsonify


def success(data: Any = None, message: str = "OK", status: int = 200):
    """Build a success envelope: ``{success, message, data}``."""
    payload = {"success": True, "message": message, "data": data if data is not None else {}}
    return jsonify(payload), status


def failure(message: str, code: str, status: int = 400):
    """Build a failure envelope: ``{success, message, error: {code}}``."""
    payload = {"success": False, "message": message, "error": {"code": code}}
    return jsonify(payload), status
