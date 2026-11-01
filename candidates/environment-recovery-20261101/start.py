import os,subprocess,json,socket,threading,time,re
cli=os.environ['SOLQ_CLI'];net=os.environ['SOLQ_STACK_NETWORK'];work=os.environ['SOLQ_STACK_DIR']
stop=threading.Event();records=[];seen=set();routes={}
# Only this disposable CI host: temporary .invalid aliases, never external DNS or a public listener.
def publish_route(name,ip):
 import ipaddress
 if not ipaddress.ip_address(ip).is_private:raise RuntimeError('nonprivate_route')
 if routes.get(name)==ip:return
 edit="import pathlib,sys;p=pathlib.Path('/etc/hosts');s=p.read_text();s='\\n'.join(l for l in s.splitlines() if not l.endswith('# SOLQ-CI-ROUTE-'+sys.argv[1]));p.write_text(s+'\\n'+sys.argv[2]+' '+sys.argv[1]+' # SOLQ-CI-ROUTE-'+sys.argv[1]+'\\n')"
 r=cmd(['sudo','python3','-c',edit,name,ip])
 if not r or r.returncode:raise RuntimeError('local_route_failed')
 routes[name]=ip

def cmd(args,timeout=8):
 try:return subprocess.run(args,text=True,capture_output=True,timeout=timeout)
 except Exception:return None
def tcp(host,port):
 try:
  with socket.create_connection((host,port),timeout=.3):return True
 except OSError:return False
def safe_lines(text):
 out=[]
 for l in text.splitlines():
  if re.search(r'password|secret|token|jwt|authorization|postgresql://|\bkey\b',l,re.I):continue
  if not re.search(r'listening|ready to accept|database system|initdb|permission denied|address already|error|failed|unhealthy|refused|fatal|exited|starting|stopping',l,re.I):continue
  l=re.sub(r'https?://\S+','[endpoint]',l)
  l=re.sub(r'[A-Za-z0-9_=.-]{60,}','[opaque]',l)
  out.append(l[:450])
 return out[-25:]
def observe():
 while not stop.is_set():
  r=cmd(['docker','ps','-aq','--filter','network='+net]);ids=(r.stdout.split() if r and r.returncode==0 else [])
  for cid in ids:
   d=cmd(['docker','inspect',cid]);
   if not d or d.returncode:continue
   c=json.loads(d.stdout)[0]
   networks=c['NetworkSettings']['Networks']
   if list(networks)!=[net]:continue
   ip=networks[net].get('IPAddress')
   if c['Name']=='/supabase_kong_solq-local-ci' and ip:publish_route('solq-ci-api.invalid',ip)
   if c['Name']!='/supabase_db_solq-local-ci':continue
   if ip:publish_route('solq-ci-db.invalid',ip)
   st=c['State'];ports=c['NetworkSettings'].get('Ports');networks=c['NetworkSettings']['Networks'];ip=networks.get(net,{}).get('IPAddress')
   internal=cmd(['docker','exec',cid,'psql','-X','-qAt','-U','postgres','-d','postgres','-c','SELECT 1'],3)
   settings=cmd(['docker','exec',cid,'psql','-X','-qAt','-U','postgres','-d','postgres','-c','SHOW listen_addresses; SHOW port'],3) if internal and internal.returncode==0 else None
   item={'status':st.get('Status'),'exitCode':st.get('ExitCode'),'health':st.get('Health',{}).get('Status'),'portBindings':c['HostConfig'].get('PortBindings'),'ports':ports,'networkMode':c['HostConfig'].get('NetworkMode'),'networkCount':len(networks),'containerSelect1':bool(internal and internal.returncode==0 and internal.stdout.strip()=='1'),'listenSettings':settings.stdout.strip().splitlines() if settings and settings.returncode==0 else [],'hostTcp54322':tcp('127.0.0.1',54322),'containerIpTcp5432':tcp(ip,5432) if ip else False}
   key=json.dumps(item,sort_keys=True)
   if key not in seen:
    seen.add(key);l=cmd(['docker','logs','--tail','50',cid]);item['postgresLog']=safe_lines((l.stdout+l.stderr) if l else '');records.append(item)
   if len(records)>30:records.pop(0)
  stop.wait(.4)
t=threading.Thread(target=observe,daemon=True);t.start()
os.environ['SUPABASE_SERVICES_HOSTNAME']='solq-ci-db.invalid'
os.environ['SUPABASE_DB_PORT']='5432'
os.environ['SUPABASE_API_EXTERNAL_URL']='http://solq-ci-api.invalid:8000'
os.environ['NO_PROXY']=os.environ.get('NO_PROXY','')+',solq-ci-db.invalid,solq-ci-api.invalid'
try:
 r=subprocess.run([cli,'--network-id',net,'start','--exclude','studio,imgproxy,logflare,vector,supavisor,realtime,storage-api,postgres-meta'],cwd=work,text=True,capture_output=True,timeout=300)
finally:
 stop.set();t.join(10)
print('DB_LIVE_OBSERVATIONS '+json.dumps(records))
print('CLI_PHASE_DIAGNOSTICS '+json.dumps(safe_lines(r.stdout+'\n'+r.stderr)))
print('CLI_START_EXIT '+str(r.returncode))
if r.returncode:raise SystemExit(1)
# Real local database connection using only the existing local development role, no new password/key.
check=cmd(['docker','exec','supabase_db_solq-local-ci','psql','-X','-qAt','-U','postgres','-d','postgres','-c','SELECT 1; SHOW server_version;'])
print('REAL_LOCAL_POSTGRES '+json.dumps({'select1':bool(check and check.returncode==0 and check.stdout.splitlines()[0]=='1'),'version':check.stdout.splitlines()[1] if check and check.returncode==0 and len(check.stdout.splitlines())>1 else None}))
if not check or check.returncode:raise SystemExit(1)
print('LOCAL_STACK_STARTED; downstream auth account creation not executed without explicit fixture-credential approval')
