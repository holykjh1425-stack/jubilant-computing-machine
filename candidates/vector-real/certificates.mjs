// New ephemeral test PKI only. Never reads an existing certificate, API key or credential store.
import {execFileSync} from 'node:child_process';import{join}from'node:path';import{writeFileSync,readFileSync,unlinkSync}from'node:fs';
export function makeCertificates(directory,openssl='openssl',includeOther=false){
 const p=n=>join(directory,n);const run=args=>execFileSync(openssl,args,{stdio:'ignore',timeout:20000});
 run(['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=SOLQ-ReadProbe-CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-keyout',p('ca.key'),'-out',p('ca.crt')]);
 for(const who of (includeOther?['server','client','other']:['server','client'])){
  run(['req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=SOLQ-ReadProbe-'+who,'-keyout',p(who+'.key'),'-out',p(who+'.csr')]);
  writeFileSync(p(who+'.ext'),who==='server'?'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n':'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=clientAuth\n',{mode:0o600});
  run(['x509','-req','-days','1','-in',p(who+'.csr'),'-CA',p('ca.crt'),'-CAkey',p('ca.key'),'-CAcreateserial','-extfile',p(who+'.ext'),'-out',p(who+'.crt')]);
 }
 unlinkSync(p('ca.key'));return{ca:readFileSync(p('ca.crt')),cert:readFileSync(p('server.crt')),key:readFileSync(p('server.key')),clientCert:readFileSync(p('client.crt')),clientKey:readFileSync(p('client.key')),otherCert:includeOther?readFileSync(p('other.crt')):undefined,otherKey:includeOther?readFileSync(p('other.key')):undefined};
}
