import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const dir=new URL('./',import.meta.url),source=fs.readFileSync(new URL('admin.js',dir),'utf8');
const block=source.slice(source.indexOf('  function planControls('),source.indexOf('  function render(application)'));
class Element {
 constructor(tag,text){this.tag=tag;this.textContent=text;this.children=[];this.listeners={};this.isConnected=true;}
 append(...items){this.children.push(...items);}setAttribute(){}replaceChildren(){this.children=[];}
 addEventListener(name,fn){this.listeners[name]=fn;}
}
let calls=0,fail=false,release=null,rendered=0,queued=[];
let snapshot={plan:null,job:null,tasks:[]};
const context=vm.createContext({generation:1,user:{id:'synthetic-admin'},freeViews:new Map(),
 element:(tag,text)=>new Element(tag,text),queueMicrotask:fn=>queued.push(fn),
 free:{snapshot:async()=>{calls++;if(release)await release;if(fail)throw Error('network');return snapshot;}},
 window:{SOLQ_PLAN_VIEW:{render:()=>rendered++}}});
vm.runInContext(block,context);
const application={id:'synthetic-application',receipt_number:'SYNTHETIC-ONLY'},article=new Element('article');
context.planControls(application,article);
const box=article.children[0],refresh=box.children.find(x=>x.tag==='button'),message=box.children.find(x=>x.tag==='p'&&x.listeners!==undefined&&x!==box.children[1]);
const results=[];
async function test(name,fn){await fn();results.push({name,pass:true});console.log('PASS',name);}
await test('construction and selection queue only a read',async()=>{assert.equal(calls,0);assert.equal(queued.length,1);assert.equal(box.children.filter(x=>x.tag==='button').length,1);await queued.shift()();assert.equal(calls,1);assert.match(message.textContent,/서버 처리 대기/);});
await test('refresh displays stored plan and job without creating anything',async()=>{snapshot={plan:{id:'p'},job:{id:'j'},tasks:[]};await refresh.listeners.click();assert.match(message.textContent,/저장된 계획 조회/);assert.match(message.textContent,/연결 작업 조회/);assert.equal(calls,2);});
await test('overlapping refreshes collapse to one read',async()=>{let done;release=new Promise(r=>done=r);const before=calls,p=refresh.listeners.click();await refresh.listeners.click();assert.equal(calls,before+1);done();await p;release=null;});
await test('connection failure stops without automatic retry',async()=>{fail=true;const before=calls;await refresh.listeners.click();assert.equal(calls,before+1);assert.match(message.textContent,/조회 실패/);assert.equal(refresh.disabled,false);fail=false;});
await test('explicit refresh recovers from a previous error',async()=>{await refresh.listeners.click();assert.match(message.textContent,/저장된 계획 조회/);});
await test('stale session and detached card suppress requests',async()=>{const before=calls;context.generation=2;await refresh.listeners.click();assert.equal(calls,before);context.generation=1;article.isConnected=false;await refresh.listeners.click();assert.equal(calls,before);article.isConnected=true;});
await test('new controls contain no generation or mutation surface',async()=>{assert.doesNotMatch(block,/\.rpc\(|\.insert\(|\.update\(|fetch\(|\.plan\(|\.assign\(|generationApi|createFreeGeneration/);assert.doesNotMatch(fs.readFileSync(new URL('admin.html',dir),'utf8'),/free-generation\.js/);assert.match(source,/setInterval\(\(\)=>\{if\(user&&!document\.hidden\)checkNewApplications\(\);\},30000\)/);});
fs.writeFileSync(new URL('readonly-controls-results.json',dir),JSON.stringify({environment:'isolated synthetic component VM; no real Auth, browser, DB or network',tests:results,passed:results.length,actual_api_calls:0},null,2));
