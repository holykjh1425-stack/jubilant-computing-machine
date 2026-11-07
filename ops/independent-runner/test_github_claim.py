import base64
import io
import json
import unittest
from unittest.mock import patch
import github_claim

class FakeResponse:
    def __init__(self, data): self.data = data
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self): return json.dumps(self.data).encode()

class Tests(unittest.TestCase):
    def test_remote_cas_payload(self):
        ledger = {"tasks": [{"id":"t","owner":"ATLAS","status":"ready","depends_on":[]}]}
        observed = []
        def fake(req, timeout):
            observed.append(req)
            if req.get_method() == "GET":
                return FakeResponse({"sha":"sha-before","content":base64.b64encode(json.dumps(ledger).encode()).decode()})
            body = json.loads(req.data)
            self.assertEqual(body["sha"], "sha-before")
            self.assertEqual(body["branch"], "dev/test")
            self.assertEqual(json.loads(base64.b64decode(body["content"]))["tasks"][0]["status"], "in_progress")
            return FakeResponse({"commit":{"sha":"commit-after"}})
        with patch.object(github_claim.urllib.request, "urlopen", side_effect=fake):
            out = github_claim.claim_remote("SOLQ","owner/repo","dev/test","tasks.json","t","ATLAS","run-1","dummy")
        self.assertEqual(out["commit_sha"], "commit-after")
        self.assertEqual(len(observed), 2)
    def test_reject_protected_branch(self):
        with self.assertRaises(ValueError):
            github_claim.claim_remote("SOLQ","owner/repo","main","tasks.json","t","ATLAS","r","dummy")

if __name__ == "__main__": unittest.main()
