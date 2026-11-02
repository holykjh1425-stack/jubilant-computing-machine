"use strict";
const form=document.querySelector("#apply-form"),error=document.querySelector("#error"),result=document.querySelector("#result");
form.addEventListener("submit",event=>{
  event.preventDefault();error.textContent="";result.hidden=true;
  if(!form.checkValidity()){error.textContent="서비스·업무 내용(10자 이상)·모의 체험 동의를 확인하세요.";form.reportValidity();return;}
  // No network calls, storage, or user data retention. The receipt is deliberately NOT a real ID.
  const bytes=new Uint8Array(4);
  if(globalThis.crypto&&crypto.getRandomValues)crypto.getRandomValues(bytes);
  else{error.textContent="보안 난수 기능을 사용할 수 없어 체험을 중단했습니다.";return;}
  const id="DEMO-"+Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
  document.querySelector("#receipt").textContent="모의 접수번호: "+id;
  document.querySelector("#details").value="";
  result.hidden=false;result.scrollIntoView({behavior:"smooth",block:"nearest"});
});
document.querySelector("#reset").addEventListener("click",()=>{form.reset();result.hidden=true;error.textContent="";document.querySelector("#category").focus();});
if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}