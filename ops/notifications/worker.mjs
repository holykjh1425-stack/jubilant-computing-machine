// No import-time execution, scheduling, environment logging or live defaults.
import {Buffer} from 'node:buffer';
export const isEmail=value=>typeof value==='string'&&value.length<=200&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(value);
const labels={application_received:'신청 접수',account_viewed:'입금계좌 보기',account_copy_requested:'입금계좌 복사 요청',account_copied:'입금계좌 복사 완료',deposit_confirmed:'관리자 실제 입금 확인'};
export function emailFor(job,{sender,adminEmail}){
 const to=job.audience==='admin'?adminEmail:job.contact;
 if(!isEmail(to)||!isEmail(sender))throw Error('invalid_recipient');
 if(!/^NX-[A-Z0-9-]{8,80}$/.test(job.receipt_number)||!labels[job.kind]||!['admin','customer'].includes(job.audience)||!/^[a-f0-9-]{36}$/.test(job.id))throw Error('invalid_job');
 const text=`SOLQ ${labels[job.kind]}\n접수번호: ${job.receipt_number}\n`+
  (job.kind.startsWith('account_')?'계좌 보기·복사는 입금 완료나 제작 승인이 아닙니다.':'입금 확인과 제작 승인은 별도 절차입니다.');
 return {from:sender,to,subject:`SOLQ ${labels[job.kind]}`,text,messageId:`<${job.id}@notifications.solqtech.com>`};
}
export function createGmailProvider({getAccessToken,fetchFn=fetch}){
 return {async send(mail){
  let accessToken;try{accessToken=await getAccessToken();if(!accessToken)throw Error();}catch{return {outcome:'failed',error_code:'auth_unavailable'};}
  const b64=text=>Buffer.from(text,'utf8').toString('base64');
  const mime=`From: ${mail.from}\r\nTo: ${mail.to}\r\nSubject: =?UTF-8?B?${b64(mail.subject)}?=\r\nMessage-ID: ${mail.messageId}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(mail.text)}`;
  try{
   const r=await fetchFn('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')}),signal:AbortSignal.timeout(20000),redirect:'error'});
   if(r.status===429)return {outcome:'retry_wait',error_code:'rate_limited'};
   if(r.status>=500)return {outcome:'uncertain',error_code:'transport_unknown'};
   if(!r.ok)return {outcome:'failed',error_code:r.status===401?'auth_unavailable':'provider_rejected'};
   const data=await r.json();
   if(typeof data.id!=='string'||!data.id)return {outcome:'uncertain',error_code:'transport_unknown'};
   // Provider accepted != delivered/read. No delivery promise based on HTTP 200.
   return {outcome:'accepted',provider_id:data.id};
  }catch{return {outcome:'uncertain',error_code:'transport_unknown'};}
 }};
}
export function createOAuthTokenSource({clientId,clientSecret,refreshToken,fetchFn=fetch}){
 return async()=>{
  if(!clientId||!clientSecret||!refreshToken)throw Error('auth_unavailable');
  const r=await fetchFn('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!r.ok)throw Error('auth_unavailable');const d=await r.json();if(typeof d.access_token!=='string')throw Error('auth_unavailable');return d.access_token;
 };
}
export async function runOnce({command,provider,config={}}){
 if(config.liveSend!=='approved'||!config.approvalId)return {blocked:'not_approved',sent:0};
 if(!provider||!isEmail(config.sender)||!isEmail(config.adminEmail))return {blocked:'not_configured',sent:0};
 await command('reconcile',{});
 const job=await command('claim',{});if(!job||job.disabled)return {idle:true,sent:0};
 let result;
 try{const mail=emailFor(job,config);result=await provider.send(mail);}
 catch(e){result={outcome:e.message==='invalid_recipient'?'skipped':'uncertain',error_code:e.message==='invalid_recipient'?'invalid_recipient':'transport_unknown'};}
 await command('finish',{id:job.id,lease_token:job.lease_token,...result});
 return {id:job.id,outcome:result.outcome,accepted:result.outcome==='accepted'?1:0};
}
