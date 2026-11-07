import unittest
from solq_dispatch import plan

def task(id,owner="FIN",status="ready",executor="planning_read_only",**kw):
    return {"id":id,"owner":owner,"status":status,"executor":executor,**kw}

class DispatchTests(unittest.TestCase):
    def test_safe_only(self):
        result=plan({"tasks":[task("a"),task("b",status="blocked"),task("c",executor="authorized_deployer"),task("d",requires_approval=True)]},"r")
        self.assertEqual([m["task_id"] for m in result["messages"]],["a"])
    def test_dependencies(self):
        result=plan({"tasks":[task("a",status="done"),task("b",depends_on=["a"]),task("c",depends_on=["missing"])]},"r")
        self.assertEqual([m["task_id"] for m in result["messages"]],["b"])
    def test_deterministic_and_no_claim(self):
        ledger={"tasks":[task("a")]}
        x=plan(ledger,"same");y=plan(ledger,"same")
        self.assertEqual(x,y)
        self.assertEqual(ledger["tasks"][0]["status"],"ready")
    def test_duplicate_rejected(self):
        with self.assertRaises(ValueError):
            plan({"tasks":[task("a"),task("a")]},"r")
    def test_unknown_owner_rejected(self):
        with self.assertRaises(ValueError):
            plan({"tasks":[task("a",owner="BAD")]},"r")

if __name__=="__main__":
    unittest.main()
