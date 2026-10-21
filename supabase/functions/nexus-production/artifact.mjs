export const artifactSchema={type:'object',additionalProperties:false,required:['summary','files'],properties:{summary:{type:'string'},files:{type:'array',minItems:1,maxItems:12,items:{type:'object',additionalProperties:false,required:['path','content'],properties:{path:{type:'string'},content:{type:'string'}}}}}};
export async function validateArtifact(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.summary!=='string'||value.summary.length>2000||!Array.isArray(value.files)||value.files.length<1||value.files.length>12)throw Error('invalid_artifact');
 if(Object.keys(value).some(k=>!['summary','files'].includes(k)))throw Error('invalid_artifact');
 const secrets=/sk-[a-zA-Z0-9_-]{8,}|sb_secret_|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/;
 if(secrets.test(value.summary))throw Error('invalid_artifact');
 const seen=new Set(),checks=[];let bytes=0;
 for(const file of value.files){
  if(!file||Object.keys(file).some(k=>!['path','content'].includes(k))||typeof file.path!=='string'||typeof file.content!=='string'
   ||!/^([a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(html|css|js|mjs|json|md|txt)$/.test(file.path)||file.path.includes('..')||file.path.length>160||seen.has(file.path)||!file.content.trim())throw Error('invalid_artifact');
  if(secrets.test(file.content))throw Error('invalid_artifact');
  const content=new TextEncoder().encode(file.content);bytes+=content.length;if(content.length>40000||bytes>64000)throw Error('invalid_artifact');
  if(file.path.endsWith('.json')){try{JSON.parse(file.content);}catch{throw Error('invalid_artifact');}}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',content)),b=>b.toString(16).padStart(2,'0')).join('');
  seen.add(file.path);checks.push({path:file.path,bytes:content.length,sha256:hash});
 }
 return {passed:true,scope:'structure_integrity_and_secret_patterns',runtime_execution_tested:false,files:checks,total_bytes:bytes,admin_review_required:true};
}
