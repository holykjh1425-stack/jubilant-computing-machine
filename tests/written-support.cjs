const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
async function test(mode){
 const nodes={},handlers={},fields={question:'A private test question',language:'English',consent:'on',transfer:'on'},look={};let calls=0,firstKey,fail=true;
 for(const id of ['support-message','lookup-message','support-receipt','new-id','new-key','support-result','question-text','answer-text'])nodes['#'+id]={hidden:true,textContent:'',value:''};
 const button={disabled:false},form={hidden:false,querySelector:()=>button,addEventListener:(t,f)=>handlers.submit=f};
 const lookup={elements:{inquiry_id:{value:''},access_token:{value:''}},querySelector:()=>({}),addEventListener:(t,f)=>handlers.lookup=f};
 nodes['#support-form']=form;nodes['#lookup-form']=lookup;
 const id='00000000-0000-4000-8000-000000000001';
 const window={crypto:require('crypto').webcrypto,NEXUS_CONFIG:{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'public'},supabase:mode==='noSdk'?null:{createClient:()=>({rpc:async(name,p)=>{
  if(name==='submit_support_inquiry'){calls++;assert.equal(p.p_consent,true);assert.equal(p.p_transfer_consent,true);assert.match(p.p_access_token,/^[a-f0-9]{64}$/);if(!firstKey)firstKey=p.p_access_token;else assert.equal(firstKey,p.p_access_token);if(mode==='retry'&&fail){fail=false;return {error:Error('network')}}return {data:id};}
  assert.equal(name,'read_support_inquiry');assert.equal(p.p_id,id);return mode==='missing'?{data:[]}:mode==='readError'?{error:Error('network')}:{data:[{question:'<img src=x onerror=alert(1)>',answer:'Written admin reply'}]};
 }})}};
 vm.runInNewContext(fs.readFileSync('support.js','utf8'),{window,document:{querySelector:s=>nodes[s]},FormData:class{constructor(f){this.fields=f===form?fields:look}get(k){return this.fields[k]}},Uint8Array,Array});
 if(mode==='noSdk'){assert.equal(button.disabled,true);return;}
 if(mode==='noConsent')fields.transfer='';
 await handlers.submit({preventDefault(){}});
 if(mode==='noConsent'){assert.equal(calls,0);return;}
 if(mode==='retry'){assert.equal(button.disabled,false);await handlers.submit({preventDefault(){}});assert.equal(calls,2);}
 assert.equal(form.hidden,true);assert.equal(nodes['#new-id'].value,id);assert.equal(nodes['#new-key'].value,firstKey);assert.equal(nodes['#support-receipt'].hidden,false);
 look.inquiry_id=id;look.access_token=firstKey;await handlers.lookup({preventDefault(){}});
 if(mode==='missing'||mode==='readError'){assert.equal(nodes['#support-result'].hidden,true);return;}
 assert.equal(nodes['#support-result'].hidden,false);assert.equal(nodes['#question-text'].textContent,'<img src=x onerror=alert(1)>');assert.equal(nodes['#answer-text'].textContent,'Written admin reply');
 look.access_token='invalid';await handlers.lookup({preventDefault(){}});assert.equal(nodes['#support-result'].hidden,true);assert.equal(nodes['#question-text'].textContent,'');
}
(async()=>{for(const mode of ['success','retry','missing','readError','noConsent','noSdk'])await test(mode);console.log('PASS 6 written support scenarios: consent, key/receipt, safe reply, retry idempotency, isolation UI, errors.');})().catch(e=>{console.error(e);process.exit(1)});
