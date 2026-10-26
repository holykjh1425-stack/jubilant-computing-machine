(()=>{
 const app='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',qid='33333333-3333-4333-8333-333333333333',did='44444444-4444-4444-8444-444444444444';
 let user={id:actor,email:'qa@example.invalid'},writes=[],reads=0,evidence=[],deposits=[],confirmations=[];
 const quote={id:qid,application_id:app,version:1,quote_reference:'QA-Q1',amount_krw:100000,issued_at:'2026-10-25T00:00:00Z',expires_at:'2099-01-01T00:00:00Z'};
 const listeners=[];const application={id:app,receipt_number:'NX-20261026-FFFFFFFF',created_at:'2026-10-26T01:00:00Z',customer_name:'가상 고객',contact:'qa@example.invalid',service_type:'ai_automation',description:'QA ONLY',status:'received'};
 const audit=()=>{let p=document.querySelector('#qa-audit');if(!p){p=document.createElement('pre');p.id='qa-audit';p.style='white-space:pre-wrap;padding:20px;background:#fff;color:#111';document.body.append(p);}p.textContent=JSON.stringify({synthetic:true,reads,writes,application_status:application.status,production_approved:false},null,2);};
 const query=t=>{const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},range(){return q;},ilike(){return q;},async maybeSingle(){reads++;audit();return {data:t==='admin_users'&&user?{user_id:actor}:null};},async single(){reads++;audit();return {data:application};},then(resolve){reads++;audit();return Promise.resolve({data:t==='applications'?[application]:[],count:t==='applications'?1:0,error:null}).then(resolve);}};return q;};
 window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:user?{user}:null}}),onAuthStateChange:fn=>listeners.push(fn),signOut:async()=>{user=null;listeners.forEach(f=>f('SIGNED_OUT'));return {};},signInWithPassword:async()=>({error:Error('No real auth in QA')})},from:query,rpc:async()=>{throw Error('No production approval in QA');},functions:{invoke:async(name,{body})=>{
  if(name!=='solq-quote-evidence')throw Error('Unknown');
  if(body.action==='list'){reads++;audit();return {data:{application_id:app,accepted:evidence.length>0,quotes:[quote],evidence,deposits,confirmations}};}
  writes.push(body.action);
  if(body.action==='record')evidence.push({id:'55555555-5555-4555-8555-555555555555',application_id:app,...body});
  if(body.action==='record_deposit')deposits.push({id:did,application_id:app,quote_id:qid,amount_krw:30000});
  if(body.action==='confirm_deposit')confirmations.push({id:'66666666-6666-4666-8666-666666666666',deposit_id:did});audit();return {data:{ok:true}};
 }}})};
 document.addEventListener('DOMContentLoaded',audit);
})();
