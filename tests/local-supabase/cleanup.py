import os,subprocess
cli=os.environ['SOLQ_CLI'];net=os.environ['SOLQ_STACK_NETWORK'];work=os.environ['SOLQ_STACK_DIR']
# Only this run's unlinked local stack, never a hosted project or another PC stack.
subprocess.run([cli,'--network-id',net,'stop','--no-backup'],cwd=work,capture_output=True,timeout=120)
r=subprocess.run(['docker','ps','-aq','--filter','network='+net],text=True,capture_output=True)
ids=r.stdout.split()
if ids:subprocess.run(['docker','rm','-f',*ids],capture_output=True,check=True)
subprocess.run(['docker','network','rm',net],capture_output=True,check=True)
print('LOCAL_STACK_CLEANED; no credentials or raw auth responses exported')
