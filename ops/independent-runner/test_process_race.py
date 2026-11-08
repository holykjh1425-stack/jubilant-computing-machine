"""Test duplicate worker claim using two real processes and a filesystem lock.
Scope: same runner only. Cross-runner GitHub CAS remains unverified.
"""
import fcntl
import json
import multiprocessing
import os
import tempfile
import time

def worker(path, queue, worker_id):
    with open(path, "r+", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            f.seek(0)
            state = json.load(f)
            if state["status"] == "ready":
                state.update(status="in_progress", owner=worker_id)
                f.seek(0)
                json.dump(state, f)
                f.truncate()
                f.flush()
                os.fsync(f.fileno())
                queue.put("CLAIMED")
            else:
                queue.put("REJECTED")
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)

if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "ledger.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"status": "ready"}, f)
        q = multiprocessing.Queue()
        p1 = multiprocessing.Process(target=worker, args=(path, q, "w1"))
        p2 = multiprocessing.Process(target=worker, args=(path, q, "w2"))
        p1.start()
        p2.start()
        p1.join(10)
        p2.join(10)
        assert p1.exitcode == 0 and p2.exitcode == 0
        results = sorted([q.get(timeout=2), q.get(timeout=2)])
        assert results == ["CLAIMED", "REJECTED"], results
        with open(path, encoding="utf-8") as f:
            state = json.load(f)
        assert state["status"] == "in_progress"
        print("PASS: two independent processes; exactly one claim; no production access")
