"""Static safety checks for the isolated SOLQ PWA prototype."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parent
class PWASafetyTests(unittest.TestCase):
    def test_required_files(self):
        for p in ("index.html","style.css","app.js","manifest.webmanifest","sw.js"):
            self.assertTrue((ROOT/p).is_file(),p)
    def test_no_live_api_or_customer_storage(self):
        js=(ROOT/"app.js").read_text()
        self.assertNotIn("fetch(",js)
        self.assertNotIn("localStorage",js)
        self.assertNotIn("sessionStorage",js)
        self.assertNotIn("supabase",js.lower())
    def test_demo_and_consent_marked(self):
        html=(ROOT/"index.html").read_text()
        self.assertIn('id="consent"',html)
        self.assertIn("모의 신청",html)
        self.assertIn("실제 고객 정보는 입력하지 마세요",html)
        self.assertIn("noindex,nofollow",html)
    def test_cache_is_public_shell_only(self):
        sw=(ROOT/"sw.js").read_text()
        self.assertNotIn("admin.html",sw)
        self.assertNotIn("api/",sw)
        self.assertNotIn("POST",sw)
    def test_manifest_is_nonproduction(self):
        import json
        manifest=json.loads((ROOT/"manifest.webmanifest").read_text())
        self.assertIn("개발",manifest["name"])
        self.assertEqual(manifest["scope"],"./")
if __name__=="__main__":
    unittest.main()
