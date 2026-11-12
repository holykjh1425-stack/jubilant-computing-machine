// Development candidate. Existing application submission remains in app.js.
import {mountConsultant} from './candidates/customer-platform-20261112/ui/consultant-ui.mjs';
if(!window.SOLQ_CONSULTANT_MOUNTED){window.SOLQ_CONSULTANT_MOUNTED=true;
 const url=new URL('./candidates/customer-platform-20261112/ui/questions.json',import.meta.url);
 fetch(url,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('questions');return r.json()}).then(questions=>mountConsultant({questions})).catch(()=>{
  const b=document.createElement('button');b.type='button';b.className='sq-fallback';b.textContent='상담 연결 준비 중 · 신청서 보기';b.onclick=()=>document.querySelector('#apply')?.scrollIntoView({behavior:'smooth'});document.body.append(b);
 });
}
