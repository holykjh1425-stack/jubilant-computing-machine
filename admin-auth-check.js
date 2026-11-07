/* Explicit, memory-only authentication and static capabilities check. No admin application imports. */
(()=>{'use strict';
 const BASE='https://elfacqmvygnwjlklqhiz.supabase.co';
 // Publishable client identifier, never a service-role/secret key.
 const KEY='sb_publishable_KhGcHvMtEgly4IAJ0w8UJQ_Eq0tGDh1';
 const ORIGIN='https://holykjh1425-stack.github.io';
 const PATH='/jubilant-computing-machine/admin-auth-check.html';
 const $=s=>document.querySelector(s),form=$('#auth-form'),start=$('#auth-start'),end=$('#auth-end'),message=$('#auth-message');
 const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 let token=null,attempted=false,running=false,ending=false;
 const result={login:'미검증',admin:'미검증',edge:'미검증',logout:'해당 없음'};
 const safe=()=>location.origin===ORIGIN&&location.pathname===PATH&&location.protocol==='https:'&&window.isSecureContext===true&&window.top===window.self;
 function paint(){for(const k of Object.keys(result))$('#result-'+k).textContent=result[k];}
 function controls(){const enabled=safe()&&$('#auth-trust').checked&&!attempted&&!running;$('#auth-email').disabled=$('#auth-password').disabled=start.disabled=!enabled;end.disabled=!token||running||ending;}
 function failure(code){if(code==='HTTP_401')return '인증 거부(401)';if(code==='HTTP_403')return '권한 또는 Origin 거부(403)';if(code==='NETWORK')return '네트워크·CORS·TLS 확인 불가';return '응답 검증 실패';}
 async function request(method,path,body,access){
  const membership=/^\/rest\/v1\/admin_users\?select=user_id&user_id=eq\.[a-f0-9-]{36}&limit=2$/.test(path);
  const login=method==='POST'&&path==='/auth/v1/token?grant_type=password'&&body&&Object.keys(body).sort().join(',')==='email,password';
  const allowed=login||(method==='GET'&&!body&&(path==='/auth/v1/user'||membership))
   ||(method==='POST'&&path==='/functions/v1/nexus-orchestrator'&&JSON.stringify(body)==='{"action":"capabilities"}')
   ||(method==='POST'&&path==='/auth/v1/logout?scope=local'&&!body);
  if(!safe()||!allowed)throw Error('REQUEST_BLOCKED');
  const headers={apikey:KEY,'Content-Type':'application/json','Cache-Control':'no-store'};
  if(access)headers.Authorization='Bearer '+access;
  let response;
  try{response=await fetch(BASE+path,{method,headers,body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});}
  catch(_){throw Error('NETWORK');}
  if(!response.ok)throw Error('HTTP_'+response.status);
  return response;
 }
 async function logout(){if(!token||ending)return;ending=true;result.logout='종료 요청 중';controls();paint();
  try{await request('POST','/auth/v1/logout?scope=local',null,token);token=null;result.logout='종료 요청 성공';}
  catch(_){result.logout='종료 확인 실패 · 버튼으로 다시 요청 가능';}
  finally{ending=false;paint();controls();}
 }
 $('#auth-trust').addEventListener('change',controls);
 end.addEventListener('click',async()=>{if(!running)await logout();});
 window.addEventListener('beforeunload',event=>{if(token||running){event.preventDefault();event.returnValue='';}});
 form.addEventListener('submit',async event=>{event.preventDefault();if(start.disabled||!safe()||attempted||running)return;
  attempted=true;running=true;controls();message.textContent='1회 인증 후 관리자 권한과 Edge 기능만 확인합니다.';
  let email=$('#auth-email').value.trim(),password=$('#auth-password').value,stage='login';
  $('#auth-email').value=$('#auth-password').value='';
  try{
   let response=await request('POST','/auth/v1/token?grant_type=password',{email,password});email=password=null;
   let session=await response.json();response=null;
   if(typeof session?.access_token!=='string'||!session.access_token)throw Error('INVALID_SESSION');
   token=session.access_token;session=null;result.logout='종료 대기';
   let identity=await(await request('GET','/auth/v1/user',null,token)).json();const uid=identity?.id;identity=null;
   if(typeof uid!=='string'||!UUID.test(uid))throw Error('INVALID_IDENTITY');
   result.login='인증 확인 성공';stage='admin';paint();
   let members=await(await request('GET','/rest/v1/admin_users?select=user_id&user_id=eq.'+uid+'&limit=2',null,token)).json();
   if(!Array.isArray(members)||members.length!==1||members[0].user_id!==uid){result.admin='등록 관리자 아님';throw Error('NOT_ADMIN');}
   members=null;result.admin='서버 권한 조회 성공';stage='edge';paint();
   const capabilities=await(await request('POST','/functions/v1/nexus-orchestrator',{action:'capabilities'},token)).json();
   if(capabilities?.paid_calls!==0||capabilities?.external_execution_enabled!==false)throw Error('UNEXPECTED_CAPABILITIES');
   result.edge='실제 인증 연결 확인 성공';
  }catch(error){const text=failure(error.message);if(stage==='login')result.login=text;else if(stage==='admin'&&result.admin==='미검증')result.admin=text;else if(stage==='edge')result.edge=text;}
  finally{
   email=password=null;await logout();running=false;paint();controls();
   message.textContent=token?'세션 종료가 확인되지 않았습니다. 종료 버튼으로 다시 요청하세요. 로그인은 반복하지 않습니다.':'검증을 마쳤습니다. 표시된 결과만 확인한 뒤 창을 닫아 주세요.';
  }
 });
 paint();controls();if(!safe())message.textContent='입력 차단: 승인된 GitHub Pages 경로에서 최상위 HTTPS 페이지로 열어야 합니다. 현재 파일은 배포 전 후보입니다.';
})();
