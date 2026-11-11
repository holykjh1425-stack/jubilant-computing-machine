from pathlib import Path
import shutil,json
root=Path(__file__).resolve().parents[2];candidate=Path(__file__).resolve().parent
preview=Path('/workspace/sites/solq-control-recovery-v2')
preview.mkdir(parents=True,exist_ok=True);(preview/'.openai').mkdir(exist_ok=True)
(preview/'.openai/hosting.json').write_text(json.dumps({'static':{'directory':'dist'}}))
out=preview/'dist';bundle=out/'candidates/control-recovery-20261112';bundle.mkdir(parents=True,exist_ok=True)
for name in ['SOLQ_control_recovery.html','ops-core.mjs','live-ui.mjs','deployment.candidate.mjs','fixture.mjs']:shutil.copy2(candidate/name,bundle/name)
(out/'vendor').mkdir(exist_ok=True);shutil.copy2(root/'vendor/supabase-2.118.0.js',out/'vendor/supabase-2.118.0.js');shutil.copy2(root/'config.js',out/'config.js')
s=(bundle/'SOLQ_control_recovery.html').read_text().replace("connect-src 'none'","connect-src 'self'")
s=s.replace('import {LIVE_READ_ENABLED}', 'import {createFixtureAdapter} from "./fixture.mjs";\nimport {LIVE_READ_ENABLED}')
s=s.replace('mount({adapter:LIVE_READ_ENABLED?makeLiveAdapter():null,fixture:false','mount({adapter:createFixtureAdapter(),fixture:true')
(bundle/'fixture.html').write_text(s)
(out/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>SOLQ 관리자 후보</title><meta http-equiv="refresh" content="0;url=/candidates/control-recovery-20261112/SOLQ_control_recovery.html">')
(out/'mobile-qa.html').write_text('<!doctype html><meta charset="utf-8"><title>SOLQ 390px 모바일 점검</title><style>body{background:#dce4df;padding:20px;font:14px system-ui}iframe{width:390px;height:844px;border:0}</style><p>390 × 844 CSS px · 격리 모의 데이터</p><iframe src="/candidates/control-recovery-20261112/fixture.html" title="SOLQ 390px 모바일"></iframe>')
print(preview)
