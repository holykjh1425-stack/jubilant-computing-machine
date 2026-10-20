const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
async function test(options={}) {
 const fields={customer_name:'QA',contact:'qa@example.invalid',service_type:options.service||'website',description:options.blank?'   ':'테스트',privacy_consent:'on',transfer_consent:options.noConsent?'':'on'};
 let handler,calls=0,payload; const storage={},button={disabled:false},message={textContent:''},link={hidden:true,focus(){this.focused=true}};
 const serviceField={value:fields.service_type};
 const form={querySelector:s=>s==='[name="service_type"]'?serviceField:button,reportValidity:()=>true,addEventListener:(_,f)=>handler=f,reset(){this.resetDone=true}};
 const window={NEXUS_CONFIG:{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'public-test'},location:{href:options.href||'https://example.invalid/index.html'},supabase:options.noSdk?null:{createClient:()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'submit_application');payload=args;return options.failure?{error:Error('test')}:{data:options.badReceipt?'bad':'NX-20261020-ABCDEF12'};}})}};
 vm.runInNewContext(fs.readFileSync('app.js','utf8'),{window,document:{querySelector:s=>s==='#application-form'?form:s==='#message'?message:link},FormData:class{get(k){return k==='service_type'?serviceField.value:fields[k]}},sessionStorage:{setItem:(k,v)=>storage[k]=v},URL});
 if(options.noSdk){assert.equal(button.disabled,true);assert.match(message.textContent,/온라인 접수 연결/);return;}
 await handler({preventDefault(){}});
 if(options.noConsent||options.blank){assert.equal(calls,0);assert.equal(button.disabled,false);assert.equal(link.hidden,true);return;}
 if(options.failure||options.badReceipt){assert.equal(button.disabled,false);assert.equal(link.hidden,true);assert.match(message.textContent,/완료되지/);return;}
 const expected=({website:'web',ai_automation:'ai',custom_system:'order',consulting:'ai'})[serviceField.value];
 if(options.expectedService)assert.equal(payload.p_service_type,options.expectedService);
 if(options.tracked)assert.match(payload.p_description,/유입: AI Portal 블로그 \/ 홈페이지 준비 체크리스트/);
 if(options.untracked)assert.ok(!payload.p_description.includes('[유입:'));
 const url=new URL(link.href);assert.equal(url.searchParams.get('service'),expected);assert.equal(url.searchParams.size,1);assert.equal(link.hidden,false);assert.equal(link.focused,true);assert.equal(storage.nexus_receipt,'NX-20261020-ABCDEF12');assert.match(payload.p_description,/국외 전송·보관 동의/);assert.equal(payload.p_privacy_consent,true);assert.equal(form.resetDone,true);assert.equal(button.disabled,true);await handler({preventDefault(){}});assert.equal(calls,1);
}
(async()=>{for(const service of ['website','ai_automation','custom_system','consulting'])await test({service});for(const key of ['failure','badReceipt','noConsent','blank','noSdk'])await test({[key]:true});await test({href:'https://example.invalid/?source=blog&campaign=website-checklist&service=ai_automation#apply',tracked:true,expectedService:'ai_automation'});await test({href:'https://example.invalid/?source=blog&campaign=untrusted&service=bad',untracked:true,expectedService:'website'});await test({href:'https://example.invalid/?source=other&campaign=website-checklist',untracked:true});console.log('PASS 12 customer-flow scenarios, including allowlisted referral recording and safe service preselection.');})().catch(e=>{console.error(e);process.exit(1)});
