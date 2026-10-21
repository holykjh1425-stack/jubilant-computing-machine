// Private server process; never include this environment in frontend hosting.
const url='https://elfacqmvygnwjlklqhiz.supabase.co/functions/v1/nexus-orchestrator';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key){console.error('worker_not_configured');process.exitCode=1;}
else try {
 const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({action:'tick'}),signal:AbortSignal.timeout(45000),redirect:'error'});
 if(!r.ok)throw Error();
 const data=await r.json();if(data.paid_calls!==0)throw Error();
 console.log(JSON.stringify({processed:data.processed,paid_calls:0}));
}catch{console.error('worker_failed_check_server_audit');process.exitCode=1;}
