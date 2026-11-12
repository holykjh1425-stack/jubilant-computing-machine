from pathlib import Path
import re,shutil,json
root=Path(__file__).resolve().parents[1];candidate=Path(__file__).resolve().parent
# candidate is repo/candidates/customer-platform-20261112, so root is repo.
root=candidate.parents[1]
preview=Path('/workspace/sites/solq-customer-platform-20261112');out=preview/'dist';out.mkdir(parents=True,exist_ok=True);(preview/'.openai').mkdir(exist_ok=True)
(preview/'.openai/hosting.json').write_text(json.dumps({'static':{'directory':'dist'}}))
for file in ['styles.css','solq-consultant.css','solq-consultant.js','app.js','preview.html']:shutil.copy2(root/file,out/file)
shutil.copytree(root/'icons',out/'icons',dirs_exist_ok=True)
for folder in ['ui','worker']:shutil.copytree(candidate/folder,out/'candidates/customer-platform-20261112'/folder,dirs_exist_ok=True)
# Only the two existing pure source modules required by the synthetic worker.
for file in ['core/providers.mjs','supabase/functions/nexus-production/artifact.mjs']:
 target=out/file;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/file,target)
text=(root/'index.html').read_text();text=re.sub(r'<script\b[^>]*>.*?</script>','',text,flags=re.S)
text=text.replace('NEXUS <b>LABS</b>','SOLQ <b>·</b>').replace('<title>넥서스랩스 앱 | NEXUS LABS</title>','<title>SOLQ | 상담·제작 통합 개발 후보</title>')
csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-src 'self' about:; object-src 'none'; base-uri 'none'; form-action 'none'"
text=text.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+csp+'"><meta name="referrer" content="no-referrer">')
bar='''<div class="qa-bar" style="padding:12px 22px;background:#f0e9fa;color:#6e5188;font:11px system-ui;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid #d8cce4"><b>격리 통합 시제품</b><span>운영 연결 없음 · 합성 접수 · 실제 유료 호출 0</span><label>합성 고객 <select id="fixture-actor"><option>A</option><option>B</option></select></label><button id="fixture-connect">모의 고객 인증</button><button id="fixture-deposit">모의 입금 확인</button><button id="fixture-approve">모의 별도 제작 승인</button><button id="fixture-expire">모의 인증 만료</button><span id="fixture-status" role="status">승인 전 제작 차단</span></div>'''
text=text.replace('<body>','<body>'+bar)
footer='<script src="qa-form-stub.js"></script><script src="app.js"></script>'
(out/'index.html').write_text(text.replace('</body>',footer+'<script type="module" src="solq-consultant.js"></script></body>'))
(out/'integrated.html').write_text(text.replace('</body>',footer+'<script type="module" src="candidates/customer-platform-20261112/ui/fixture-page.mjs"></script></body>'))
(out/'qa-form-stub.js').write_text('''// Synthetic intake only; no transport or storage.
window.NEXUS_CONFIG={SUPABASE_URL:'https://isolated.example.invalid',SUPABASE_ANON_KEY:'SYNTHETIC_ONLY'};
window.supabase={createClient(){return {async rpc(name,args){if(name!=='submit_application'||args.p_privacy_consent!==true)throw Error('FORBIDDEN');return {data:'NX-20261112-A0000001',error:null};}}}};
''')
(out/'mobile-qa.html').write_text('<!doctype html><meta charset="utf-8"><title>SOLQ 390px 모바일 상담 검증</title><style>body{margin:16px;background:#eae7ee;font:13px system-ui}iframe{width:390px;height:844px;border:0;box-shadow:0 8px 30px #40304d20}</style><p>390 × 844 CSS px · 합성 고객·운영 연결 없음</p><iframe src="integrated.html" title="SOLQ 모바일 시제품"></iframe>')
(out/'preview-security.html').write_text('<!doctype html><meta charset="utf-8"><title>SOLQ 미리보기 차단 검사</title><h1>격리 미리보기 보안 검사</h1><pre id="preview-security-result"></pre><iframe title="악성 합성 시안 차단 검사" style="width:700px;height:440px"></iframe><script type="module" src="candidates/customer-platform-20261112/ui/preview-security-page.mjs"></script>')
(out/'mobile-keyboard-qa.html').write_text('<!doctype html><meta charset="utf-8"><title>SOLQ 축소 높이 검증</title><style>body{margin:16px;background:#eae7ee;font:13px system-ui}iframe{width:390px;height:360px;border:0}</style><p>390 × 360 CSS px · 키보드 점유 유사 높이, 실제 키보드 검증 아님</p><iframe src="integrated.html" title="SOLQ 축소 높이 시제품"></iframe>')
print(preview)
