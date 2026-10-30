// Fixed-profile, one-day local test certificates. Built-in Node crypto only.
// No existing keys, filesystem, certificate store, subprocess or network access.
import {generateKeyPairSync,randomBytes,sign,X509Certificate,createPrivateKey} from 'node:crypto';
const concat=(...v)=>Buffer.concat(v);
function der(tag,body){
 const n=body.length;let length;
 if(n<128)length=Buffer.from([n]);
 else{const a=[];for(let x=n;x;x=Math.floor(x/256))a.unshift(x%256);length=Buffer.from([128+a.length,...a]);}
 return concat(Buffer.from([tag]),length,body);
}
const seq=(...x)=>der(0x30,concat(...x));
const oid=hex=>der(6,Buffer.from(hex,'hex'));
const bool=()=>der(1,Buffer.from([255]));
const alg=()=>seq(oid('2a864886f70d01010b'),der(5,Buffer.alloc(0))); // sha256WithRSAEncryption
const name=cn=>seq(der(0x31,seq(oid('550403'),der(12,Buffer.from(cn)))));
const pem=(label,b)=>Buffer.from(`-----BEGIN ${label}-----\n${b.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`);
const extension=(id,value,critical=false)=>seq(oid(id),...(critical?[bool()]:[]),der(4,value));
const date=d=>der(0x18,Buffer.from(d.toISOString().replace(/[-:T]/g,'').replace(/\.\d{3}Z$/,'Z')));
function pair(){return generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:65537});}
function certificate(subject,issuer,publicKey,issuerKey,ca,start,end,role){
 const serial=randomBytes(16);serial[0]=(serial[0]&0x7f)|1;
 const extensions=[
  extension('551d13',ca?seq(bool(),der(2,Buffer.from([0]))):seq(),true),
  extension('551d0f',der(3,Buffer.from(ca?[1,6]:role==='server'?[5,160]:[7,128])),true)
 ];
 if(!ca){
  extensions.push(extension('551d25',seq(oid(role==='server'?'2b06010505070301':'2b06010505070302'))));
  if(role==='server')extensions.push(extension('551d11',seq(der(0x82,Buffer.from('localhost')),der(0x87,Buffer.from([127,0,0,1])))));
 }
 const tbs=seq(der(0xa0,der(2,Buffer.from([2]))),der(2,serial),alg(),name(issuer),seq(date(start),date(end)),name(subject),publicKey.export({type:'spki',format:'der'}),der(0xa3,seq(...extensions)));
 return pem('CERTIFICATE',seq(tbs,alg(),der(3,concat(Buffer.from([0]),sign('sha256',tbs,issuerKey)))));
}
export function makeCertificates(_unusedDirectory,_unusedExecutable,includeOther=false){
 const now=Date.now(),start=new Date(now-60000),end=new Date(now+86400000);
 const root=pair(),rootName='SOLQ-ReadProbe-CA';
 const ca=certificate(rootName,rootName,root.publicKey,root.privateKey,true,start,end);
 const result={ca};
 for(const role of includeOther?['server','client','other']:['server','client']){
  const keys=pair();const cert=certificate('SOLQ-ReadProbe-'+role,rootName,keys.publicKey,root.privateKey,false,start,end,role);
  const key=keys.privateKey.export({type:'pkcs8',format:'pem'});
  const parsed=new X509Certificate(cert);
  if(!parsed.verify(root.publicKey)||!parsed.checkPrivateKey(createPrivateKey(key)))throw Error('EPHEMERAL_CERTIFICATE_SELF_CHECK_FAILED');
  if(role==='server'){result.cert=cert;result.key=Buffer.from(key);}
  else{result[role+'Cert']=cert;result[role+'Key']=Buffer.from(key);}
 }
 // Root private KeyObject is not returned; no CA signing key is written to disk.
 return result;
}
