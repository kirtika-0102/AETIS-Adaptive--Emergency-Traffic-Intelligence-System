#!/usr/bin/env python3
"""Runner wrapper for scripts/simulate_driver_gps.py from project root."""
import os
import sys
from pathlib import Path

# Add aetis-backend to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "aetis-backend"
sys.path.insert(0, str(backend_dir))

script_path = backend_dir / "scripts" / "simulate_driver_gps.py"
if script_path.exists():
    with open(script_path, "r", encoding="utf-8") as f:
        code = f.read()
    exec(code)
