"""Synthetic-only public-key stream validation; never connects to a DB or user's keys."""
import hashlib,json,os,shutil,subprocess,tempfile,time,sys
from pathlib import Path
assert shutil.which('gpg') and shutil.which('gpgconf')
ram=Path('/dev/shm');assert ram.is_dir()
# Refuse visible host swap for this temporary test. Hypervisor paging is not asserted.
assert len(Path('/proc/swaps').read_text().strip().splitlines())<=1,'Visible swap requires separate isolation review'
results=[]
def run(args,blob=None,check=True):
 result=subprocess.run(args,input=blob,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False,timeout=45)
 if check and result.returncode:raise RuntimeError(result.stderr.decode(errors='replace'))
 return result
with tempfile.TemporaryDirectory(prefix='solq-crypto-',dir=ram) as tmp:
 root=Path(tmp);os.chmod(root,0o700);secret=root/'dec';public=root/'enc';secret.mkdir(mode=0o700);public.mkdir(mode=0o700)
 def g(home,*args,blob=None,check=True):return run(['gpg','--no-options','--homedir',str(home),'--batch','--no-tty',*args],blob,check)
 try:
  g(secret,'--pinentry-mode','loopback','--passphrase','','--quick-generate-key','SOLQ SYNTHETIC ONLY <synthetic@example.invalid>','rsa2048','encrypt','1d')
  lines=g(secret,'--with-colons','--list-keys').stdout.decode().splitlines();fpr=next(x.split(':')[9] for x in lines if x.startswith('fpr:'))
  pub=g(secret,'--export',fpr).stdout # PUBLIC key only; no secret export command exists.
  g(public,'--import',blob=pub);pub=None
  assert not any(x.startswith(b'sec:') for x in g(public,'--with-colons','--list-secret-keys').stdout.splitlines())
  results.append({'name':'encryption home contains public key only','passed':True})
  payload=b'SOLQ_SYNTHETIC_NO_CUSTOMER_DATA\n'+bytes(range(256))*8192
  encrypted=g(public,'--trust-model','always','--cipher-algo','AES256','--recipient',fpr,'--encrypt','--output','-',blob=payload).stdout
  assert payload[:64] not in encrypted and len(encrypted)>0
  results.append({'name':'synthetic bytes encrypted through stdin with no plaintext data file','passed':True})
  decrypted=g(secret,'--pinentry-mode','loopback','--passphrase','','--decrypt','--output','-',blob=encrypted).stdout
  assert hashlib.sha256(payload).digest()==hashlib.sha256(decrypted).digest();decrypted=None
  results.append({'name':'synthetic private-key home decrypts original bytes with matching SHA256','passed':True})
  broken=bytearray(encrypted);broken[len(broken)//2]^=1
  bad=g(secret,'--pinentry-mode','loopback','--passphrase','','--decrypt','--output','-',blob=bytes(broken),check=False)
  assert bad.returncode!=0;bad=None
  results.append({'name':'corrupt ciphertext rejected by decryption exit status','passed':True})
  bad=g(public,'--trust-model','always','--recipient','0000000000000000000000000000000000000000','--encrypt','--output','-',blob=payload,check=False)
  assert bad.returncode!=0;bad=None
  results.append({'name':'missing recipient fails closed','passed':True})
  # Encryption can succeed on a failed/empty producer; a coordinator MUST check both exits.
  producer=subprocess.Popen([sys.executable,'-c',"import sys;sys.stdout.buffer.write(b'SYNTHETIC_PARTIAL_OUTPUT');sys.exit(17)"],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  encryptor=subprocess.Popen(['gpg','--no-options','--homedir',str(public),'--batch','--no-tty','--trust-model','always','--recipient',fpr,'--encrypt','--output','-'],stdin=producer.stdout,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  producer.stdout.close()
  partial_cipher,encrypt_error=encryptor.communicate(timeout=45)
  producer_exit=producer.wait(timeout=45)
  assert producer_exit==17 and encryptor.returncode==0 and len(partial_cipher)>0
  promote=producer_exit==0 and encryptor.returncode==0
  assert not promote
  partial_cipher=encrypt_error=None
  results.append({'name':'producer failure forbids promotion even when encryption itself succeeds','passed':True})
  artifact={'tested_at_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'gpg_version':run(['gpg','--version']).stdout.decode().splitlines()[0],
   'data':'synthetic binary only','plaintext_bytes':len(payload),'customer_data':False,'user_keys_accessed':False,'usb_accessed':False,'secret_key_exported':False,
   'test_key':'ephemeral synthetic RSA2048 in tmpfs; no persistent/user key generation',
   'isolation':{'key_files':'temporary tmpfs 0700','plaintext_data_files':0,'visible_swap_entries':0,'hypervisor_paging_verified':False},
   'public_key_only_encryption':True,'synthetic_decrypt_verified':True,'windows_or_user_key_verified':False,'failed_producer_exit':producer_exit,'partial_encryptor_exit':encryptor.returncode,
   'ciphertext_sha256':hashlib.sha256(encrypted).hexdigest(),'tests':results}
  payload=encrypted=None
 finally:
  for home in [secret,public]:run(['gpgconf','--homedir',str(home),'--kill','gpg-agent'],check=False)
# Temporary synthetic key directories have now been removed.
artifact['synthetic_key_cleanup']=not root.exists()
assert artifact['synthetic_key_cleanup']
Path(__file__).with_name('results.json').write_text(json.dumps(artifact,indent=2)+'\n')
for x in results:print('PASS '+x['name'])
print('synthetic key cleanup: PASS; no real backup or user-key restore performed')
