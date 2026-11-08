import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../..');
const api='https://elfacqmvygnwjlklqhiz.supabase.co';
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/admin'){res.writeHead(307,{location:'/admin.html'});res.end();return;}
  const file=resolve(root,'.'+pathname);if(!file.startsWith(root+'/'))throw Error('path');
  const data=pathname==='/config.js'?Buffer.from(`window.NEXUS_CONFIG=${JSON.stringify({SUPABASE_URL:api,SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC_ONLY'})};`):await readFile(file);
  const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'}[extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const results=[];
async function check(width,nonAdmin=false){
 const context=await browser.newContext({viewport:{width,height:1000}});
 const page=await context.newPage();const writes=[],reads=[],errors=[],external=[];
 const admin='11111111-1111-4111-8111-111111111111';const uid=nonAdmin?'99999999-9999-4999-8999-999999999999':admin;
 const user={id:uid,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-26T00:00:00Z'};
 const payload={sub:uid,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64(payload)+'.SYNTHETIC_UNSIGNED_NOT_VALID';
 const a={id:'10000000-0000-4000-8000-000000000001',receipt_number:'NX-SYNTHETIC-ONLY',customer_name:'가상 검증',contact:'synthetic@example.invalid',service_type:'ai_automation',description:'가상 분류 요청',status:'received',created_at:'2026-10-26T00:00:00Z'};
 const kinds=['requirements','classification','scope','implementation','validation','human_review'];
 const p={id:'20000000-0000-4000-8000-000000000001',application_id:a.id,created_at:a.created_at,plan:{application_id:a.id,steps:kinds,details:kinds.map((x,i)=>({ordinal:i+1,title:`가상 계획 ${i+1}`,proposed_scope:'격리된 테스트 상세',status:i===5?'awaiting_approval':'completed'}))}};
 const j={id:'30000000-0000-4000-8000-000000000001',application_id:a.id,free_plan_id:p.id,status:'awaiting_approval',created_at:a.created_at};
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin)return route.continue();
  if(url.origin!==api){external.push(url.origin);return route.abort();}
  const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Expose-Headers':'Content-Range','Content-Range':'0-0/1'};
  const reply=(data,status=200)=>route.fulfill({status,headers,body:JSON.stringify(data)});
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/auth/v1/token')return reply({access_token:token,refresh_token:'SYNTHETIC_ONLY',expires_in:3600,token_type:'bearer',user});
  if(url.pathname==='/auth/v1/user')return reply(user);
  if(url.pathname.startsWith('/rest/v1/')){
   const table=url.pathname.split('/').pop();
   if(!['GET','HEAD'].includes(req.method())){
    writes.push({method:req.method(),table,body:req.postDataJSON()});
    assert.equal(table,'applications');assert.equal(req.method(),'PATCH');
    a.status=req.postDataJSON().status;
    return reply(req.headers().accept?.includes('vnd.pgrst.object')?{id:a.id,status:a.status}:[{id:a.id,status:a.status}]);
   }
   reads.push(table);
   const data={admin_users:nonAdmin?[]:[{user_id:admin}],applications:[a],ai_work_plans:[p],orchestrator_jobs:[j],orchestrator_tasks:kinds.map((kind,i)=>({kind,status:i===5?'awaiting_approval':'completed'})),support_inquiries:[]}[table];
   assert.notEqual(data,undefined,'Unexpected endpoint '+table);return reply(data);
  }
  throw Error('Unexpected URL '+url.pathname);
 });
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/admin');
 assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(),1);
 await page.locator('#admin-email').fill('synthetic@example.invalid');
 await page.locator('#admin-password').fill('SYNTHETIC_ONLY');
 await page.locator('#login-form button[type=submit]').click();
 if(nonAdmin){await page.waitForFunction(()=>document.querySelector('#login-msg').textContent.includes('관리자 권한'));assert.equal(await page.locator('#data-panel').isVisible(),false);assert.equal(writes.length,0);results.push({non_admin_rejected:true,real_auth_server:false});await context.close();return;}
 await page.waitForFunction(()=>document.querySelectorAll('#rows ol li').length===6);
 const taskReads=reads.filter(t=>t==='orchestrator_tasks').length;
 await page.getByRole('button',{name:'↻ 새로고침',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 await page.waitForTimeout(31500); // One real 30-second timer, not a mocked callback.
 assert.ok(reads.filter(t=>t==='orchestrator_tasks').length>=taskReads+2);
 assert.equal(writes.length,0);
 await page.evaluate(()=>{const s=document.createElement('script');s.textContent='window.SOLQ_INLINE_SHOULD_NOT_RUN=true';document.head.append(s);});
 assert.equal(await page.evaluate(()=>window.SOLQ_INLINE_SHOULD_NOT_RUN),undefined);
 await page.getByRole('combobox',{name:'NX-SYNTHETIC-ONLY 진행 상태',exact:true}).selectOption('reviewing');
 await page.getByRole('button',{name:'상태 저장',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.status-badge').dataset.status==='reviewing');
 assert.equal(writes.length,1);assert.equal(writes[0].body.status,'reviewing');
 await page.getByRole('combobox',{name:'NX-SYNTHETIC-ONLY 진행 상태',exact:true}).selectOption('in_progress');
 await page.getByRole('button',{name:'상태 저장',exact:true}).click();assert.equal(writes.length,1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const response=await context.request.get(origin+'/admin.html');assert.equal(response.headers()['cache-control'],'no-store');
 results.push({width,real_sdk:true,real_auth_server:false,original_csp_preserved:true,inline_script_blocked:true,real_timer_wait_ms:31500,business_writes_during_login_reads_timer:0,explicit_synthetic_status_updates:1,unapproved_production_requests:0,steps:6,errors:0,overflow:false,local_cache_policy:'no-store',production_cache_verified:false});
 await context.close();
}
try{await Promise.all([check(1440),check(390)]);await check(390,true);console.log('SOLQ_SDK_RESULT='+JSON.stringify(results));}
finally{await browser.close();server.close();}
