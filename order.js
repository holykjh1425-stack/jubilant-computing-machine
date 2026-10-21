const c=window.NEXUS_CONFIG||{},$=id=>document.getElementById(id),form=$('order-form'),message=$('message');
const states={awaiting_deposit:'접수 완료 · 견적 및 입금 확인 대기',queued:'입금 확인 · 실행 환경 준비 또는 작업 순서 대기',running:'작업 진행 중',awaiting_review:'결과 생성 완료 · 관리자 검토 중',released:'결과 전달 완료',failed:'작업 확인 필요 · 관리자에게 문의해 주세요',cancelled:'취소',blocked:'관리자 확인 필요'};
let token,receipt,timer,busy=false,urls=[];
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
async function call(body){const r=await fetch(c.SUPABASE_URL+'/functions/v1/nexus-production',{method:'POST',headers:{'Content-Type':'application/json',apikey:c.SUPABASE_ANON_KEY},body:JSON.stringify(body),referrerPolicy:'no-referrer'});const data=await r.json();if(!r.ok||data.error)throw Error();return data;}
function render(data){
 receipt=data.receipt_number;$('new-order').hidden=true;$('my-order').hidden=false;$('receipt').textContent='접수번호 '+receipt;$('status').textContent=states[data.status]||'확인 중';
 const type=data.preview?.service_type;$('preview').textContent='미리보기 준비: '+({website:'홈페이지 화면',ai_automation:'업무 자동화 흐름',custom_system:'맞춤 주문·관리 화면',consulting:'도입 범위 정리'}[type]||'작업 범위');
 $('demo').href='preview.html?service='+({website:'web',custom_system:'order'}[type]||'ai');
 try{sessionStorage.setItem('nexus_receipt',receipt);}catch{}
 $('deliverables').hidden=!data.result;urls.forEach(URL.revokeObjectURL);urls=[];$('result-downloads').replaceChildren();$('result-preview').hidden=true;
 if(data.result){$('result-summary').textContent=data.result.summary;for(const file of data.result.files){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([file.content],{type:'application/octet-stream'}));urls.push(url);a.href=url;a.download=file.path.replaceAll('/','_');a.className='download';a.textContent=file.path+' 다운로드';$('result-downloads').append(a);}
  const html=data.result.files.find(x=>x.path==='index.html');if(html){$('result-preview').srcdoc=html.content;$('result-preview').hidden=false;}}
}
async function load(){if(busy||!receipt||!token)return;busy=true;try{render(await call({action:'portal',receipt_number:receipt,token}));message.textContent='진행 상태를 확인했습니다.';}catch{message.textContent='전용 링크 또는 서버 연결을 확인해 주세요. 문의창으로 도움을 요청할 수 있습니다.';}finally{busy=false;}}
form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button');if(button.disabled||!form.reportValidity())return;const f=new FormData(form);token ||= random();button.disabled=true;message.textContent='접수 중…';
 try{const data=await call({action:'submit',token,customer_name:String(f.get('customer_name')).trim(),contact:String(f.get('contact')).trim(),service_type:f.get('service_type'),description:String(f.get('description')).trim(),privacy_consent:f.get('privacy_consent')==='on',transfer_consent:f.get('transfer_consent')==='on'});receipt=data.receipt_number;
  history.replaceState(null,'','#'+new URLSearchParams({receipt,token}));render(data);message.textContent='접수가 완료됐습니다. 전용 링크를 보관해 주세요.';start();
 }catch{message.textContent='접수 확인에 실패했습니다. 같은 내용으로 다시 누르면 중복 접수를 방지합니다.';}finally{button.disabled=false;}});
form.addEventListener('input',()=>{token=null;});$('refresh-order').addEventListener('click',load);
function start(){clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)load();},30000);}
const hash=new URLSearchParams(location.hash.slice(1));if(/^[a-f0-9]{64}$/.test(hash.get('token')||'')&&/^NX-/.test(hash.get('receipt')||'')){token=hash.get('token');receipt=hash.get('receipt');load();start();}
