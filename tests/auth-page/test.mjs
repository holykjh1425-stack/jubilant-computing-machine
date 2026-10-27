import {createRequire} from 'node:module';import vm from 'node:vm';import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const require=createRequire(process.env.SOLQ_TEST_DEPS?process.env.SOLQ_TEST_DEPS+'/package.json':new URL('../free-generation/package.json',import.meta.url));const {parseHTML}=require('linkedom');
const root=new URL('../../',import.meta.url),html=readFileSync(new URL('admin-auth-check.html',root),'utf8'),source=readFileSync(new URL('admin-auth-check.js',root),'utf8');
const results=[];async function test(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name);}
const flush=async()=>{for(let i=0;i<18;i++)await new Promise(r=>setImmediate(r));};
function setup(mode='success',options={}){
 const {window}=parseHTML(html),{document}=window,calls=[];let releases=[];
 const uid='aaaaaaaa-0000-4000-8000-000000000001';let logoutCalls=0;
 const fetch=async(url,opt)=>{
  const path=url.replace('https://elfacqmvygnwjlklqhiz.supabase.co','');calls.push({path,method:opt.method,body:opt.body,credentials:opt.credentials,cache:opt.cache,redirect:opt.redirect});
  if(mode==='pending'&&path.includes('/token?'))await new Promise(r=>releases.push(r));
  if(mode==='network'&&path.includes('/token?'))throw Error('SENSITIVE_BACKEND_ERROR');
  const denied=(mode==='auth401'&&path.includes('/token?'))||(mode==='user401'&&path==='/auth/v1/user')||(mode==='edge401'&&path.includes('/functions/'));
  if(denied)return {ok:false,status:401};
  if(mode==='edge403'&&path.includes('/functions/'))return {ok:false,status:403};
  if(mode==='cors'&&path.includes('/functions/'))throw new TypeError('SENSITIVE_RAW_ERROR');
  if(path.includes('/logout?')&&mode==='logoutfail'&&++logoutCalls===1)throw Error('SENSITIVE_RAW_ERROR');
  const data=path.includes('/token?')?{access_token:'SYNTHETIC_TOKEN',refresh_token:'SYNTHETIC_REFRESH'}:path==='/auth/v1/user'?{id:mode==='baduid'?'malformed':uid,email:'SYNTHETIC_EMAIL'}:path.includes('admin_users')?(mode==='nonadmin'?[]:[{user_id:mode==='mismatch'?'bbbbbbbb-0000-4000-8000-000000000001':uid}]):path.includes('/functions/')?{paid_calls:mode==='paid'?1:0,external_execution_enabled:false,agents:{internal:{enabled:true}}}:{};
  return {ok:true,status:200,json:async()=>data};
 };
 Object.defineProperty(window,'self',{value:window,configurable:true});
 Object.defineProperty(window,'top',{value:options.frame?{}:window,configurable:true});
 Object.defineProperty(window,'isSecureContext',{value:!options.insecure,configurable:true});
 const location={origin:options.origin||'https://holykjh1425-stack.github.io',pathname:options.path||'/jubilant-computing-machine/admin-auth-check.html',protocol:options.protocol||'https:'};
 const forbidden=()=>{throw Error('storage access forbidden');};
 const context={window,document,location,fetch,AbortSignal,localStorage:new Proxy({},{get:forbidden}),sessionStorage:new Proxy({},{get:forbidden}),console:new Proxy({},{get:forbidden}),setInterval:forbidden,setTimeout:forbidden};
 vm.runInNewContext(source,context);
 const $=s=>document.querySelector(s);const trust=()=>{$('#auth-trust').checked=true;$('#auth-trust').dispatchEvent(new window.Event('change'));};
 const submit=()=>{$('#auth-email').value='SYNTHETIC_EMAIL';$('#auth-password').value='SYNTHETIC_PASSWORD';$('#auth-form').dispatchEvent(new window.Event('submit',{cancelable:true}));};
 return {$,document,window,calls,trust,submit,release:()=>releases.forEach(r=>r())};
}
await test('only the new pinned script is loaded; CSP restricts network, forms and child execution',()=>{
 const {document}=parseHTML(html);const scripts=[...document.querySelectorAll('script')];assert.equal(scripts.length,1);assert.equal(scripts[0].getAttribute('src'),'admin-auth-check.js');
 const hash='sha256-'+createHash('sha256').update(source).digest('base64');assert.equal(scripts[0].getAttribute('integrity'),hash);
 const csp=document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;assert.ok(csp.includes("script-src '"+hash+"'"));for(const v of ["default-src 'none'","frame-src 'none'","form-action 'none'","worker-src 'none'"])assert.ok(csp.includes(v));
 assert.ok(!/admin\.js|orchestrator-admin\.js|production-admin\.js|<iframe/i.test(html));assert.ok(!/localStorage|sessionStorage|\.cookie|console\.|setInterval|setTimeout|service_role|\.signUp|resetPassword/.test(source.replace(/\/\*[\s\S]*?\*\//g,'')));
});
await test('no request or credentials enabled before explicit trust and submit',()=>{const s=setup();assert.equal(s.calls.length,0);assert.equal(s.$('#auth-start').disabled,true);s.trust();assert.equal(s.calls.length,0);assert.equal(s.$('#auth-start').disabled,false);});
await test('file, wrong origin/path, iframe and insecure contexts block before authentication',async()=>{
 for(const opt of [{origin:'null',protocol:'file:'},{origin:'https://example.invalid'},{path:'/other/admin-auth-check.html'},{frame:true},{insecure:true}]){const s=setup('success',opt);s.trust();s.submit();await flush();assert.equal(s.calls.length,0);assert.equal(s.$('#auth-start').disabled,true);}
});
await test('successful flow has exactly five allowlisted requests then current-session logout',async()=>{const s=setup();s.trust();s.submit();await flush();assert.deepEqual(s.calls.map(c=>[c.method,c.path.split('?')[0]]),[['POST','/auth/v1/token'],['GET','/auth/v1/user'],['GET','/rest/v1/admin_users'],['POST','/functions/v1/nexus-orchestrator'],['POST','/auth/v1/logout']]);assert.equal(s.calls[3].body,'{"action":"capabilities"}');assert.ok(s.calls[4].path.endsWith('scope=local'));assert.ok(s.calls.every(c=>c.credentials==='omit'&&c.cache==='no-store'&&c.redirect==='error'));assert.match(s.$('#result-edge').textContent,/成功|성공/);assert.match(s.$('#result-logout').textContent,/성공/);});
await test('credentials and tokens do not appear in rendered results, API bodies or storage',async()=>{const s=setup();s.trust();s.submit();await flush();assert.equal(s.$('#auth-email').value,'');assert.equal(s.$('#auth-password').value,'');assert.ok(!/SYNTHETIC_|aaaaaaaa/.test(s.document.querySelector('main').textContent));assert.ok(s.calls.slice(1).every(c=>!c.body||!c.body.includes('SYNTHETIC')));});
await test('invalid password and network failure stop with no automatic retry',async()=>{for(const mode of ['auth401','network']){const s=setup(mode);s.trust();s.submit();await flush();s.submit();await flush();assert.equal(s.calls.length,1);assert.equal(s.$('#auth-start').disabled,true);assert.ok(!s.$('#result-login').textContent.includes('성공'));}});
await test('server getUser rejection or malformed identity prevents membership/Edge and logs out',async()=>{for(const mode of ['user401','baduid']){const s=setup(mode);s.trust();s.submit();await flush();assert.equal(s.calls.length,3);assert.ok(!s.calls.some(c=>c.path.includes('/functions/')));assert.match(s.$('#result-logout').textContent,/성공/);}});
await test('non-admin and mismatched membership never invoke Edge and log out',async()=>{for(const mode of ['nonadmin','mismatch']){const s=setup(mode);s.trust();s.submit();await flush();assert.equal(s.calls.length,4);assert.ok(!s.calls.some(c=>c.path.includes('/functions/')));assert.equal(s.$('#result-admin').textContent,'등록 관리자 아님');assert.match(s.$('#result-logout').textContent,/성공/);}});
await test('401, 403, network/CORS and unsafe capabilities results are distinct and never PASS',async()=>{const texts=[];for(const mode of ['edge401','edge403','cors','paid']){const s=setup(mode);s.trust();s.submit();await flush();texts.push(s.$('#result-edge').textContent);assert.ok(!s.$('#result-edge').textContent.includes('성공'));assert.match(s.$('#result-logout').textContent,/성공/);assert.ok(!s.document.querySelector('main').textContent.includes('SENSITIVE'));}assert.equal(new Set(texts).size,4);});
await test('logout failure is not falsely successful; only explicit logout retry is enabled',async()=>{const s=setup('logoutfail');s.trust();s.submit();await flush();assert.match(s.$('#result-logout').textContent,/실패/);assert.equal(s.$('#auth-end').disabled,false);assert.equal(s.$('#auth-start').disabled,true);s.$('#auth-end').click();await flush();assert.match(s.$('#result-logout').textContent,/성공/);assert.equal(s.calls.filter(c=>c.path.includes('/token?')).length,1);});
await test('double submit during pending authentication sends only one login',async()=>{const s=setup('pending');s.trust();s.submit();s.submit();await flush();assert.equal(s.calls.length,1);s.release();await flush();assert.equal(s.calls.filter(c=>c.path.includes('/token?')).length,1);});
writeFileSync(new URL('results.json',import.meta.url),JSON.stringify({tested_at_utc:new Date().toISOString(),environment:'linkedom synthetic DOM and injected HTTP transport',actual_browser_csp_verified:false,real_auth_or_edge_called:false,existing_pass_reused:true,tests:results},null,2)+'\n');
