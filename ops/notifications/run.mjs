import {createGmailProvider,createOAuthTokenSource,runOnce} from './worker.mjs';
const env=process.env;
const config={liveSend:env.SOLQ_NOTIFY_LIVE_SEND,approvalId:env.SOLQ_NOTIFY_APPROVAL_ID,sender:env.SOLQ_NOTIFY_SENDER,adminEmail:env.SOLQ_NOTIFY_ADMIN_EMAIL};
const command=async(action,input)=>{
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.SUPABASE_URL||'')||(env.SOLQ_NOTIFICATION_WORKER_KEY||'').length<32)throw Error('not_configured');
 const r=await fetch(env.SUPABASE_URL+'/functions/v1/solq-notifications',{method:'POST',headers:{Authorization:`Bearer ${env.SOLQ_NOTIFICATION_WORKER_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({action,...input}),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok)throw Error('command_failed');return r.json();
};
const provider=createGmailProvider({getAccessToken:createOAuthTokenSource({clientId:env.SOLQ_GMAIL_CLIENT_ID,clientSecret:env.SOLQ_GMAIL_CLIENT_SECRET,refreshToken:env.SOLQ_GMAIL_REFRESH_TOKEN})});
try{console.log(JSON.stringify(await runOnce({command,provider,config})));}catch{console.error('notification_worker_failed');process.exitCode=1;}
