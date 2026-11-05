"""Isolated evidence-ledger Gate evaluator; not a production gate approval."""
import json, hashlib
GATES = {
    "Gate-1": ["owner_backup_access"],
    "Gate-2": ["encrypted_full_backup", "backup_checksum"],
    "Gate-3": ["isolated_restore", "restore_integrity"],
    "Gate-4": ["measured_rpo", "measured_rto"],
    "Gate-5": ["security_closure"],
    "Gate-6": ["desktop_regression", "android_regression", "ios_regression", "rollback_verified"],
}
def digest(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
def evaluate(evidence, ledger):
    result = {}
    for gate, kinds in GATES.items():
        checks = {}
        for kind in kinds:
            checks[kind] = []
            for item in evidence:
                if item.get("kind") != kind: continue
                evidence_id = item.get("evidence_id")
                if (evidence_id and item.get("created_at") and item.get("producer")
                    and item.get("status") == "VERIFIED" and item.get("sha256") == digest(item.get("payload"))
                    and ledger.get(evidence_id) == item["sha256"]):
                    checks[kind].append(evidence_id)
        result[gate] = {"status": "PASS" if all(checks.values()) else "BLOCKED", "checks": checks}
    return {"gates": result, "ready_for_approval": False, "scope": "ISOLATED_CALCULATION_ONLY"}
def run_tests():
    assert all(v["status"] == "BLOCKED" for v in evaluate([], {})["gates"].values())
    evidence = []
    for kinds in GATES.values():
        for kind in kinds:
            payload = {"kind": kind, "test_marker": "SYNTHETIC_ONLY"}
            evidence.append({"kind": kind, "evidence_id": "TEST-" + kind, "created_at": "2026-11-05T06:20:00Z", "producer": "LOCAL_TEST", "status": "VERIFIED", "payload": payload, "sha256": digest(payload)})
    ledger = {x["evidence_id"]: x["sha256"] for x in evidence}
    assert all(v["status"] == "PASS" for v in evaluate(evidence, ledger)["gates"].values())
    evidence[0]["payload"]["test_marker"] = "TAMPERED"
    assert evaluate(evidence, ledger)["gates"]["Gate-1"]["status"] == "BLOCKED"
    evidence[0]["payload"]["test_marker"] = "SYNTHETIC_ONLY"
    del ledger[evidence[-1]["evidence_id"]]
    assert evaluate(evidence, ledger)["gates"]["Gate-6"]["status"] == "BLOCKED"
    assert evaluate(evidence, ledger)["ready_for_approval"] is False
    print("4 PASS / 0 FAIL; production Gate PASS unverified; READY_FOR_APPROVAL false")
if __name__ == "__main__": run_tests()
