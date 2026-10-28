import os,subprocess,pathlib
cli=os.environ['SOLQ_CLI'];net=os.environ['SOLQ_STACK_NETWORK'];work=os.environ['SOLQ_STACK_DIR']
def run(args,timeout=60):
 r=subprocess.run(args,cwd=work,text=True,capture_output=True,timeout=timeout)
 if r.returncode:raise RuntimeError('LOCAL_STACK_COMMAND_FAILED; output suppressed to protect local credentials')
 return r.stdout
help=run([cli,'start','--help']);assert '--exclude' in help
run([cli,'--network-id',net,'start','--exclude','studio,imgproxy,logflare,vector,supavisor,realtime,storage-api,postgres-meta'],timeout=480)
# Functions use only local generated credentials supplied by the CLI; stdout/stderr are never logged.
subprocess.Popen([cli,'--network-id',net,'functions','serve','solq-local-plan'],cwd=work,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
print('REAL_LOCAL_STACK_STARTED; hosted project not linked; credentials suppressed')
