from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parent
dist=root/'dist'
html=(dist/'admin.html').read_text()
html=html.replace('<script src="vendor/supabase-2.118.0.js" defer></script>','').replace('<script src="config.js" defer></script>','')
html=html.replace('connect-src https://elfacqmvygnwjlklqhiz.supabase.co',"connect-src 'none'")
html=html.replace('<script src="free-workflow.js"></script>','<script src="qa-fixture.js" defer></script><script src="free-workflow.js" defer></script>')
(dist/'qa.html').write_text(html)
(dist/'qa-fixture.js').write_text((root/'qa-fixture.js').read_text())
(dist/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>SOLQ isolated safety QA</title><h1>합성 관리자 검증 · 운영 연결 없음</h1><a href="qa.html">관리자 조회</a> <a href="qa.html?mode=ordinary">일반 사용자 거부</a> <a href="qa.html?mode=duplicate">중복 연결 차단</a>')
(root/'.openai').mkdir(exist_ok=True)
(root/'.openai/hosting.json').write_text(json.dumps({'static':{'directory':'dist'}}))
print('Synthetic preview only; CSP connect-src none; no production credentials')
