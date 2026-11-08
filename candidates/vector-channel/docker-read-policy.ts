// PURE REQUEST/RESPONSE POLICY ONLY. Not a listening proxy. Never opens a Docker socket.
const containerId=(x:string)=>/^[a-f0-9]{64}$/.test(x);
const fail=()=>({allowed:false as const,status:403 as const});
export function authorizeDockerRead(method:string,target:string,allowedIds:readonly string[]) {
 if(!allowedIds.length||allowedIds.length>64||!allowedIds.every(containerId)||new Set(allowedIds).size!==allowedIds.length)return fail();
 if(typeof target!=='string'||target.length>4096||!target.startsWith('/')||/[\\#\u0000-\u0020\u007f]/.test(target)||target.includes('//')||target.includes('..'))return fail();
 if(method!=='GET'&&method!=='HEAD')return fail();
 const split=target.indexOf('?');const rawPath=split<0?target:target.slice(0,split);const query=new URLSearchParams(split<0?'':target.slice(split+1));
 if(rawPath.includes('%'))return fail();
 const path=rawPath.replace(/^\/v1\.[0-9]{2,3}(?=\/)/,'');
 if([...query.keys()].length!==new Set(query.keys()).size)return fail();
 if(method==='HEAD'&&path!=='/_ping')return fail();
 if(path==='/_ping'||path==='/version'){
  if([...query].length)return fail();return {allowed:true as const,path,projection:path==='/version'?'version':'ping'};
 }
 if(method!=='GET')return fail();
 if(path==='/containers/json'||path==='/events'){
  const valid=path==='/events'?['filters','since']:['filters','all'];
  if([...query.keys()].some(k=>!valid.includes(k)))return fail();
  if(query.has('since')&&!/^[0-9]{1,12}$/.test(query.get('since')!))return fail();
  if(query.has('all')&&query.get('all')!=='0'&&query.get('all')!=='false')return fail();
  // Ignore caller filters: scope is rebuilt from pinned full IDs, never names/prefixes.
  const scoped=new URLSearchParams({filters:JSON.stringify({container:[...allowedIds]})});
  if(path==='/containers/json'){scoped.delete('filters');scoped.set('filters',JSON.stringify({id:[...allowedIds]}));scoped.set('all','false');}
  if(query.has('since'))scoped.set('since',query.get('since')!);
  return {allowed:true as const,path:path+'?'+scoped,projection:path==='/events'?'events':'list'};
 }
 const match=/^\/containers\/([a-f0-9]{64})\/(json|logs)$/.exec(path);
 if(!match||!allowedIds.includes(match[1]))return fail();
 if(match[2]==='json'){
  if([...query].length)return fail();return {allowed:true as const,path,projection:'inspect'};
 }
 if([...query.keys()].some(k=>!['stdout','stderr','follow','since','tail','timestamps'].includes(k)))return fail();
 for(const k of ['stdout','stderr','follow','timestamps'])if(query.has(k)&&!['true','false','1','0'].includes(query.get(k)!))return fail();
 if(query.has('since')&&!/^[0-9]{1,12}$/.test(query.get('since')!))return fail();
 if(query.has('tail')&&!/^(?:[0-9]{1,3}|1000)$/.test(query.get('tail')!))return fail();
 const scoped=new URLSearchParams({stdout:'true',stderr:'true',follow:'true',tail:query.get('tail')??'100'});
 if(query.has('since'))scoped.set('since',query.get('since')!);
 return {allowed:true as const,path:path+'?'+scoped,projection:'logs'};
}
export function projectContainer(raw:any,ids:readonly string[]) {
 if(!raw||typeof raw.Id!=='string'||!ids.includes(raw.Id)||!containerId(raw.Id))throw Error('container_scope_denied');
 // No Env, Mounts, HostConfig, NetworkSettings, credentials, commands or arbitrary labels.
 return {Id:raw.Id,Name:typeof raw.Name==='string'?raw.Name.slice(0,200):'',Names:Array.isArray(raw.Names)?raw.Names.filter((v:any)=>typeof v==='string').map((v:string)=>v.slice(0,200)).slice(0,10):[],
  Created:typeof raw.Created==='number'&&Number.isSafeInteger(raw.Created)?raw.Created:(typeof raw.Created==='string'&&/^[0-9T:.Z+-]{10,40}$/.test(raw.Created)?raw.Created:null),State:typeof raw.State==='string'?(['running','exited','created','paused','restarting','dead'].includes(raw.State)?raw.State:'unknown'):{Running:raw.State?.Running===true},Config:{Tty:raw.Config?.Tty===true,Labels:{}}};
}
// Not deployable: a real proxy must ALSO enforce client isolation, upstream identity and response scoping,
// sanitize events/version, bound streams, strip headers, deny upgrades/redirects and cap resources.
// Logs can themselves contain secrets; a GET-only filter does not make them public-safe.
