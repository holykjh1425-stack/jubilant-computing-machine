const {chromium}=require('playwright');
const fs=require('fs');const assert=require('assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let html=fs.readFileSync('ops/admin-integration-candidate/admin.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'').replace(/<link[^>]*>/g,'');
 await page.setContent(html);
 await page.addStyleTag({content:fs.readFileSync(process.env.SOLQ_QA_STYLES||'../live-styles.css','utf8')});
 await page.evaluate(()=>{
 window.reads=[];window.writes=[];window.intervals=[];window.setInterval=fn=>{window.intervals.push(fn);return window.intervals.length};
 const a={id:'00000000-0000-4000-8000-000000000001',receipt_number:'NX-SYNTHETIC-001',created_at:'2026-10-26T04:54:00Z',customer_name:'격리 테스트',contact:'synthetic@example.invalid',service_type:'ai_automation',description:'테스트용 문의 분류 요청',status:'received'};
 const steps=['requirements','classification','scope','implementation','validation','human_review'];
 const p={id:'00000000-0000-4000-8000-000000000002',application_id:a.id,plan:{application_id:a.id,steps,details:steps.map((x,i)=>({ordinal:i+1,title:['고객 요청 분석','서비스 유형 및 목적 분류','자동화 가능 범위 판단','구체적인 실행 단계','예상 결과·제약·비용 검토','관리자 검토용 최종 계획'][i],proposed_scope:'고객별 요청과 분류 조건을 확인하는 테스트 상세 내용입니다. '.repeat(3),...(i===5?{status:'awaiting_approval'}:{})}))}};
 const j={id:'00000000-0000-4000-8000-000000000003',application_id:a.id,free_plan_id:p.id,status:'awaiting_approval'};
 const user={id:'11111111-1111-4111-8111-111111111111',email:'admin@example.invalid'};
 const db={auth:{getSession:async()=>({data:{session:{user}}}),getUser:async()=>({data:{user}}),onAuthStateChange:()=>{},signOut:async()=>({}),signInWithPassword:async()=>({})},from(table){
 const q={select(){window.reads.push(table);return q},eq(){return q},order(){return q},limit(){return q},range(){return q},ilike(){return q},maybeSingle:async()=>({data:{user_id:user.id}}),then(resolve){resolve({data:table==='applications'?[a]:table==='ai_work_plans'?[p]:table==='orchestrator_jobs'?[j]:table==='orchestrator_tasks'?steps.map(kind=>({kind,status:'completed'})):[],count:1})},update(){window.writes.push('update');throw Error('unexpected write')}};return q;}};
 window.NEXUS_CONFIG={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_synthetic'};window.supabase={createClient:()=>db};
 window.fetch=()=>{window.writes.push('fetch');throw Error('unexpected network')};
 });
 for(const name of ['free-workflow.js','plan-view.js','admin.js'])await page.addScriptTag({content:fs.readFileSync('ops/admin-integration-candidate/'+name,'utf8')});
 await page.waitForFunction(()=>document.querySelectorAll('#rows ol li').length===6);
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'계획·작업 조회',exact:true}).click();
 await page.evaluate(async()=>{for(const fn of window.intervals)await fn()});
 await page.waitForFunction(()=>document.querySelectorAll('#rows ol li').length===6);
 assert.equal(await page.locator('#rows ol li').count(),6);
 assert.ok((await page.locator('#rows').innerText()).includes('NX-SYNTHETIC-001'));
 assert.ok((await page.locator('#rows ol li').last().innerText()).includes('관리자 검토 대기'));
 assert.equal(await page.evaluate(()=>window.writes.length),0);
 assert.equal(await page.locator('#login-panel').isVisible(),false);
 assert.equal(await page.locator('#data-panel').isVisible(),true);
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#rows ol li')].some(e=>e.scrollWidth>e.clientWidth)),false);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'../admin-candidate-'+width+'.png',fullPage:true});
 console.log('PASS '+width+'px: six details, receipt, admin session, repeat/poll reads, zero writes, no step overflow');
 await page.close();
}}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
