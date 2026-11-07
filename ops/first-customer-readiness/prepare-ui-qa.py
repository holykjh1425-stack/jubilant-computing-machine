"""Build a local-only fixture from current candidate assets. No hosting identity, secrets or network."""
from pathlib import Path
import shutil,json
root=Path(__file__).resolve().parents[2]
# Destination must be provided explicitly; never write into the live Sites checkout.
import sys
out=Path(sys.argv[1]).resolve();assert out!=root and '.sites-checkout' not in str(out)
(out/'dist').mkdir(parents=True,exist_ok=True);(out/'.openai').mkdir(exist_ok=True)
for name in ['admin.js','free-workflow.js','plan-view.js','quote-flow.js','quote-panel.js','admin-review.css']:
 shutil.copy(root/name,out/'dist'/name)
# Use the unchanged tracked base CSS for a complete checkout.
shutil.copy(root/'admin-base.css',out/'dist/admin-base.css')
shutil.copy(root/'tests/fixtures/quote-flow/qa-db.js',out/'dist/qa-db.js')
s=(root/'admin.html').read_text().replace('vendor/supabase-2.118.0.js','qa-db.js').replace('connect-src https://elfacqmvygnwjlklqhiz.supabase.co',"connect-src 'none'").replace('<body>','<body><aside>QA ONLY · 가상 관리자·고객 · 실제 인증·입금·제작 없음</aside>')
(out/'dist/admin.html').write_text(s)
(out/'dist/config.js').write_text('window.NEXUS_CONFIG={SUPABASE_URL:"https://qa.supabase.co",SUPABASE_ANON_KEY:"sb_publishable_QATEST"};')
(out/'dist/index.html').write_text('<!doctype html><meta charset="utf-8"><h1>격리 UI QA</h1><iframe title="mobile-admin" src="admin.html" style="width:390px;height:1100px"></iframe>')
(out/'.openai/hosting.json').write_text(json.dumps({'static':{'directory':'dist'}}))
