'use strict';
const byId=id=>document.getElementById(id);
const plan=byId('plan-ready'),issued=byId('quote-issued'),scope=byId('scope-ok'),terms=byId('terms-ok');
const q=byId('to-quote'),c=byId('to-consent'),done=byId('consent-button');
plan.addEventListener('change',()=>{q.disabled=!plan.checked;});
q.addEventListener('click',()=>{if(!plan.checked)return;byId('quote').style.display='block';q.disabled=true;plan.disabled=true;byId('quote').scrollIntoView({behavior:'smooth'});});
issued.addEventListener('change',()=>{c.disabled=!issued.checked;});
c.addEventListener('click',()=>{if(!issued.checked)return;byId('consent').style.display='block';c.disabled=true;issued.disabled=true;byId('consent').scrollIntoView({behavior:'smooth'});});
function check(){done.disabled=!(scope.checked&&terms.checked);}
scope.addEventListener('change',check);terms.addEventListener('change',check);
done.addEventListener('click',()=>{if(done.disabled)return;byId('complete').style.display='block';done.disabled=true;scope.disabled=true;terms.disabled=true;byId('complete').scrollIntoView({behavior:'smooth'});});