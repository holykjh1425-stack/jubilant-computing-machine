"""Pure state machine for SOLQ task recovery. No network or side effects.

A stale lease NEVER automatically authorizes a second executor. It becomes
'needs_review' until an independent operator verifies the old run stopped.
"""
from datetime import datetime, timedelta, timezone

def utc(s):
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("timezone required")
    return dt.astimezone(timezone.utc)

def expired_claim(task, now):
    claim = task.get("claim") or {}
    return task.get("status") == "in_progress" and bool(claim.get("lease_until")) and utc(claim["lease_until"]) <= now

def mark_stale_for_review(ledger, now):
    changed = []
    for task in ledger["tasks"]:
        if expired_claim(task, now):
            task["status"] = "needs_review"
            task["review_reason"] = "Lease expired; verify previous executor stopped and side effects before reclaim"
            changed.append(task["id"])
    return changed

def review_reclaim(ledger, task_id, reviewer, evidence, old_run_stopped, no_side_effects):
    if not reviewer or not evidence or not old_run_stopped or not no_side_effects:
        raise ValueError("independent stop and side-effect evidence required")
    task = next((x for x in ledger["tasks"] if x["id"] == task_id), None)
    if task is None or task.get("status") != "needs_review":
        raise ValueError("not reviewable")
    if reviewer == (task.get("claim") or {}).get("worker"):
        raise PermissionError("independent reviewer required")
    task["recovery"] = {"reviewer": reviewer, "evidence": evidence, "old_run_stopped": True, "no_side_effects": True}
    task.pop("claim", None)
    task["status"] = "ready"

def next_ready(ledger, owner):
    done = {t["id"] for t in ledger["tasks"] if t.get("status") == "done"}
    eligible = [t for t in ledger["tasks"] if t.get("owner") == owner and t.get("status") == "ready" and all(d in done for d in t.get("depends_on", []))]
    return sorted(eligible, key=lambda t: t["id"])[0]["id"] if eligible else None
