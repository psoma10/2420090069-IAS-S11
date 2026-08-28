"""Pytest configuration for the CyberVault backend.

Putting the backend root on ``sys.path`` here means every test module can
``from app import create_app`` without its own path shim.
"""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
