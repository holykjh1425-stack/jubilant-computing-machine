(() => {
 'use strict';
 const mode=new URLSearchParams(location.search).get('mode')||'admin';
 const audit={mode,reads:0,writes:0,network:0,intervals:0,auth:'synthetic-only'};
 const output=document.createElement('pre');output.id='qa-audit';output.style.cssText='position:fixed;bottom:0;left:0;background:white;color:black;z-index:9999;font-size:12px';document.body.append(output);
 const show=()=>{output.textContent=JSON.stringify(audit);};
 const timers=[];window.setInterval=fn=>{timers.push(fn);audit.intervals++;show();return timers.length;};
 const timerButton=document.createElement('button');timerButton.type='button';timerButton.textContent='격리 조회 타이머 실행';timerButton.id='qa-timer';timerButton.style.cssText='position:fixed;top:0;right:0;z-index:9999';
 timerButton.addEventListener('click',async()=>{for(const fn of timers)await fn();show();});document.body.append(timerButton);
 const fail=()=>{audit.writes++;show();throw Error('unexpected business write');};
 window.fetch=()=>{audit.network++;show();throw Error('network disabled');};
 let signedIn=true;
 const user={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.invalid'};
 const application={id:'00000000-0000-4000-8000-000000000001',receipt_number:'NX-20990101-AAAAAAAA',created_at:'2099-01-01T00:00:00Z',customer_name:'합성 검증',contact:'synthetic@example.invalid',service_type:'ai_automation',description:'운영 고객이 아닌 격리 데이터입니다.',status:'received'};
 const steps=['requirements','classification','scope','implementation','validation','human_review'];
 const plan={id:'00000000-0000-4000-8000-000000000002',application_id:application.id,plan:{steps,details:steps.map((_,i)=>({title:'검증 단계 '+(i+1),status:i===5?'awaiting_approval':'completed',proposed_scope:'합성 계획'}))}};
 const job={id:'00000000-0000-4000-8000-000000000003',application_id:application.id,free_plan_id:plan.id,status:'awaiting_approval'};
 const db={auth:{getSession:async()=>({data:{session:signedIn?{user}:null}}),getUser:async()=>({data:{user:signedIn?user:null}}),onAuthStateChange:()=>{},signOut:async()=>{signedIn=false;return{};},signInWithPassword:async()=>({error:new Error('actual credentials forbidden in fixture')})},functions:{invoke:fail},rpc:fail,from(table){
  audit.reads++;show();
  let column,value;
  const q={select(){return q;},eq(c,v){column=c;value=v;return q;},order(){return q;},limit(){return q;},range(){return q;},ilike(){return q;},update:fail,insert:fail,delete:fail,upsert:fail,
   maybeSingle:async()=>({data:table==='admin_users'&&mode!=='ordinary'?{user_id:user.id}:null}),
   then(resolve){
    const data=table==='applications'?[application]:table==='ai_work_plans'?[plan]:table==='orchestrator_jobs'?(mode==='duplicate'?[job,{...job,id:'00000000-0000-4000-8000-000000000004'}]:[job]):table==='orchestrator_tasks'?steps.map((kind,i)=>({kind,status:i===5?'awaiting_approval':'completed',verified:i<5})):[];
    resolve({data,count:data.length});
   }};return q;
 }};
 window.NEXUS_CONFIG={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_synthetic'};
 window.supabase={createClient:()=>db};show();
})();
