"""Pure task claim transition. Caller MUST commit using GitHub blob-SHA CAS."""
from datetime import timedelta

def claim(ledger, task_id, worker, run_id, now, ttl_seconds=900):
    if not worker or not run_id or ttl_seconds <= 0:
        raise ValueError("invalid claim")
    tasks = ledger["tasks"]
    task = next((t for t in tasks if t["id"] == task_id), None)
    if task is None or task.get("status") != "ready":
        raise ValueError("task not ready")
    if task.get("owner") != worker:
        raise PermissionError("wrong owner")
    if any(next((t for t in tasks if t["id"] == dep), {}).get("status") != "done" for dep in task.get("depends_on", [])):
        raise ValueError("dependencies not done")
    task.update(status="in_progress", claim={"worker": worker, "run_id": run_id, "started_at": now.isoformat(), "lease_until": (now + timedelta(seconds=ttl_seconds)).isoformat()})
    return ledger
