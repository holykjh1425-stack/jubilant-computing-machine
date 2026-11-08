import copy
import unittest
from datetime import datetime, timezone
from recovery import mark_stale_for_review, review_reclaim, next_ready

NOW = datetime(2026, 11, 2, 1, 0, tzinfo=timezone.utc)
def sample():
    return {"tasks":[{"id":"a","owner":"ATLAS","status":"in_progress","claim":{"worker":"ATLAS","run_id":"r1","lease_until":"2026-11-02T00:00:00+00:00"}},{"id":"b","owner":"ATLAS","status":"ready","depends_on":["a"]}]}
class RecoveryTests(unittest.TestCase):
    def test_expiry_quarantines(self):
        x=sample()
        self.assertEqual(mark_stale_for_review(x,NOW),["a"])
        self.assertEqual(x["tasks"][0]["status"],"needs_review")
    def test_no_auto_reclaim(self):
        x=sample();mark_stale_for_review(x,NOW)
        self.assertIsNone(next_ready(x,"ATLAS"))
        with self.assertRaises(ValueError):
            review_reclaim(x,"a","GUARD","",True,True)
    def test_independent_review(self):
        x=sample();mark_stale_for_review(x,NOW)
        with self.assertRaises(PermissionError):
            review_reclaim(x,"a","ATLAS","evidence",True,True)
        review_reclaim(x,"a","GUARD","verified-stop-evidence",True,True)
        self.assertEqual(next_ready(x,"ATLAS"),"a")
    def test_dependency(self):
        x=sample()
        self.assertIsNone(next_ready(x,"ATLAS"))
        x["tasks"][0]["status"]="done"
        self.assertEqual(next_ready(x,"ATLAS"),"b")
if __name__=="__main__": unittest.main()
