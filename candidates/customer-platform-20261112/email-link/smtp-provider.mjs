// Adapter to an already-approved SERVER SMTP transport. Does not create a connection or read secrets.
// Configure that transport separately: smtp.gmail.com:587, STARTTLS required, cert validation ON.
import {fail,normalizeEmail} from '../verified-email/service.mjs';
import {SENDER} from './notifications.mjs';
export function createSmtpProvider({enabled=false,synthetic=false,smtpApproved=false,deliveryApproved=false,costApproved=false,transport}={}){
 return {async send(message){
  if(!enabled||!transport||!synthetic&&(!smtpApproved||!deliveryApproved||!costApproved))throw fail('NOT_DEPLOYED');
  const to=normalizeEmail(message.to);
  if(typeof message.subject!=='string'||/[\r\n]/.test(message.subject)||message.subject.length>200||typeof message.text!=='string'||message.text.length>4000||!['transactional_receipt','transactional_completion'].includes(message.classification))throw fail('INVALID_MESSAGE');
  try{
   // No caller-supplied from, replyTo, cc/bcc, HTML, attachments, headers, URL or arbitrary envelope.
   const r=await transport.sendMail({from:{name:SENDER.name,address:SENDER.email},to,subject:message.subject,text:message.text});
   // SMTP has no exactly-once idempotency support. Durable lease/unknown control remains mandatory.
   if(Array.isArray(r?.accepted)&&r.accepted.some(x=>typeof x==='string'&&x.toLowerCase()===to))return {accepted:true};
   if(Array.isArray(r?.accepted)&&r.accepted.length===0&&Array.isArray(r.rejected)&&r.rejected.some(x=>typeof x==='string'&&x.toLowerCase()===to))return {definitelyNotAccepted:true};
   return {unknown:true};
  }catch{return {unknown:true}} // Raw provider errors may contain SMTP credentials. Never return/log them.
 }};
}
