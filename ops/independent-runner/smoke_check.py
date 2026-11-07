#!/usr/bin/env python3
"""Credential-free safety smoke check for a candidate independent runner."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
required = [
    "ops/independent-runner/README.md",
    "ops/independent-runner/smoke_check.py",
]
missing = [name for name in required if not (ROOT / name).is_file()]
assert not missing, f"Missing files: {missing}"
assert os.getenv("SOLQ_PRODUCTION_DB_URL") is None, "Production credential must not be present"
result = {
    "status": "PASS",
    "check": "credential_free_smoke",
    "scope": "local_repository_only",
    "production_writes": 0,
    "paid_api_calls": 0,
    "backup_restored": False,
    "work_session_restarted": False,
}
print(json.dumps(result, ensure_ascii=False, sort_keys=True))
