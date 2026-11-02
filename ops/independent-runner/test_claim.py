import copy
import unittest
from datetime import datetime, timezone
from claim import claim
NOW = datetime(2026, 11, 2, tzinfo=timezone.utc)

class Tests(unittest.TestCase):
    def setUp(self):
        self.data = {"tasks": [{"id": "a", "owner": "ATLAS", "status": "ready", "depends_on": []}, {"id": "b", "owner": "ATLAS", "status": "ready", "depends_on": ["a"]}]}
    def test_claim(self):
        x = claim(copy.deepcopy(self.data), "a", "ATLAS", "r1", NOW)
        self.assertEqual(x["tasks"][0]["status"], "in_progress")
    def test_duplicate(self):
        x = claim(copy.deepcopy(self.data), "a", "ATLAS", "r1", NOW)
        with self.assertRaises(ValueError):
            claim(x, "a", "ATLAS", "r2", NOW)
    def test_wrong_owner(self):
        with self.assertRaises(PermissionError):
            claim(copy.deepcopy(self.data), "a", "FIN", "r1", NOW)
    def test_dependencies(self):
        with self.assertRaises(ValueError):
            claim(copy.deepcopy(self.data), "b", "ATLAS", "r1", NOW)
    def test_missing(self):
        with self.assertRaises(ValueError):
            claim(copy.deepcopy(self.data), "x", "ATLAS", "r1", NOW)

if __name__ == "__main__":
    unittest.main()
