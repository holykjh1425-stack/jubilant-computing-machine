import os,subprocess,pathlib,re,json
cli=os.environ['SOLQ_CLI'];net=os.environ['SOLQ_STACK_NETWORK'];work=os.environ['SOLQ_STACK_DIR']
def run(args,timeout=60):
 r=subprocess.run(args,cwd=work,text=True,capture_output=True,timeout=timeout)
 if r.returncode:
  # Diagnose startup only. Drop any secret-related line and redact opaque values/URLs.
  lines=[]
  for line in (r.stderr+'\n'+r.stdout).splitlines():
   if re.search(r'secret|password|anon|jwt|token|key|postgresql://',line,re.I):continue
   if not re.search(r'error|failed|unhealthy|denied|timed out|not found',line,re.I):continue
   line=re.sub(r'https?://\S+','[endpoint]',line)
   line=re.sub(r'[A-Za-z0-9_=-]{32,}','[opaque]',line)
   lines.append(line[:350])
  print('SANITIZED_STARTUP_DIAGNOSTIC '+json.dumps(lines[-5:]))
  raise RuntimeError('LOCAL_STACK_COMMAND_FAILED; credential-bearing output suppressed')
 return r.stdout
help=run([cli,'start','--help']);assert '--exclude' in help
run([cli,'--network-id',net,'start','--exclude','studio,imgproxy,logflare,vector,supavisor,realtime,storage-api,postgres-meta'],timeout=480)
# Functions use only local generated credentials supplied by the CLI; stdout/stderr are never logged.
subprocess.Popen([cli,'--network-id',net,'functions','serve','solq-local-plan'],cwd=work,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
print('REAL_LOCAL_STACK_STARTED; hosted project not linked; credentials suppressed')
