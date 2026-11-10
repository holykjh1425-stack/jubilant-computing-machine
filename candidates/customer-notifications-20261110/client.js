/* Add before the existing intake script; enabled only by explicit reviewed config. */
(() => {
 const c=window.NEXUS_CONFIG||{};
 if(c.SOLQ_NOTIFICATIONS_ENABLED!==true)return;
 const endpoint=new URL('/functions/v1/solq-notifications',c.SUPABASE_URL).href;
 const storage='solq-notification-intake-v1';
 let memory;
 function read(){try{return JSON.parse(sessionStorage.getItem(storage)||'null')||memory;}catch{return memory;}}
 function save(value){memory=value;try{sessionStorage.setItem(storage,JSON.stringify(value));}catch{}}
 async function call(body,jwt){
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:c.SUPABASE_ANON_KEY,...(jwt?{Authorization:`Bearer ${jwt}`}:{})},body:JSON.stringify(body),referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),redirect:'error'});
  const d=await r.json();if(!r.ok||d?.error)throw Error('notification_request_failed');return d;
 }
 window.SOLQ_NOTIFICATIONS={
  reset(){memory=null;try{sessionStorage.removeItem(storage);}catch{}},
  async submit(input){
   // The existing intake already has a random draft UUID. Reuse that opaque key.
   // Payload equality is enforced independently by the server's SHA-256 hash.
   const signature=/^[a-f0-9-]{36}$/i.test(input.id||'')?input.id:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input)))),b=>b.toString(16).padStart(2,'0')).join('');let state=read();
   if(!state||state.signature!==signature){state={token:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),signature};save(state);}
   // A transport failure is ambiguous. Retain the same token and do not fall back to a second intake API.
   const result=await call({action:'submit',token:state.token,...input});
   if(!/^NX-[0-9]{8}-[A-F0-9]{8}$/.test(result?.receipt_number||''))throw Error('invalid_receipt');
   // Do not retain name/contact/description in sessionStorage.
   save({token:state.token,signature,receipt_number:result.receipt_number});return result.receipt_number;
  },
  async account(kind){
   const state=read();if(!state?.receipt_number)return false;
   await call({action:'account_event',token:state.token,receipt_number:state.receipt_number,kind});return true;
  },
  async snapshot(jwt){return call({action:'snapshot'},jwt);}
 };
 document.getElementById('new-application')?.addEventListener('click',()=>window.SOLQ_NOTIFICATIONS.reset());
 const accountButton=document.getElementById('copy-account');
 if(accountButton){
  void window.SOLQ_NOTIFICATIONS.account('account_viewed').catch(()=>{});
  accountButton.addEventListener('click',()=>{void window.SOLQ_NOTIFICATIONS.account('account_copy_requested').catch(()=>{});});
 }
})();
