// Server-only HTTP wrapper for enrollment-lifecycle.mjs. Default disabled.
// It does not accept a caller-supplied account/application ID or split verify from binding.
export function createCustomerLinkHandler({enabled=false,allowedOrigins=[],lifecycle}={}){
 return async req=>{
  const origin=req.headers.get('origin');const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin&&allowedOrigins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(body,status)=>new Response(JSON.stringify(body),{status,headers});
  if(!enabled||!lifecycle?.exchange)return reply({error:'not_deployed'},503);
  if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(!origin||!allowedOrigins.includes(origin))return reply({error:'origin_denied'},403);
  const authorization=req.headers.get('authorization')||'';if(!/^Bearer [^\s]{20,8192}$/.test(authorization))return reply({error:'auth_required'},401);
  try{
   let total=0,chunks=[];if(!req.body)return reply({error:'invalid_request'},400);
   for await(const chunk of req.body){total+=chunk.length;if(total>4096)return reply({error:'body_too_large'},413);chunks.push(chunk);}
   const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
   let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({error:'invalid_request'},400)}
   if(!input||Object.keys(input).sort().join(',')!=='enrollmentProof,receiptNumber'||typeof input.receiptNumber!=='string'||input.receiptNumber.length>100||typeof input.enrollmentProof!=='string'||input.enrollmentProof.length>2048)return reply({error:'invalid_request'},400);
   const linked=await lifecycle.exchange({authorization,receiptNumber:input.receiptNumber,enrollmentProof:input.enrollmentProof});input.enrollmentProof=null;
   return reply(linked,200);
  }catch(error){const code=error?.code;return reply({error:code==='ALREADY_BOUND'?'already_bound':code==='AUTH_REQUIRED'?'auth_required':code==='VERIFIED_IDENTITY_REQUIRED'?'verified_identity_required':code==='PROOF_DENIED'?'proof_denied':'link_not_completed'},code==='ALREADY_BOUND'?409:code==='AUTH_REQUIRED'?401:['VERIFIED_IDENTITY_REQUIRED','PROOF_DENIED'].includes(code)?403:503)}
 };
}
