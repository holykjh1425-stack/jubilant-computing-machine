import pathlib,re,subprocess,tomllib,json,os
cli=os.environ['SOLQ_CLI'];work=pathlib.Path(os.environ['SOLQ_STACK_DIR']);work.mkdir(exist_ok=True)
def run(args):return subprocess.run([cli,*args],cwd=work,text=True,capture_output=True,check=True).stdout
# Discover commands before use; never login/link/deploy or supply a project ref.
for group in (['--help'],['init','--help'],['start','--help'],['status','--help'],['stop','--help'],['functions','serve','--help']):run(group)
run(['init'])
p=work/'supabase/config.toml';s=p.read_text();s=re.sub(r'^project_id\s*=.*$', 'project_id = "solq-local-ci"',s,flags=re.M)
# Auto-confirm synthetic users only; no mail/real identity providers.
s=re.sub(r'(?m)^enable_confirmations\s*=.*$', 'enable_confirmations = false',s)
s+='\n[functions.solq-local-plan]\nverify_jwt = true\n'
p.write_text(s);tomllib.loads(s)
f=work/'supabase/functions/solq-local-plan';f.mkdir(parents=True)
f.joinpath('index.ts').write_text(pathlib.Path('candidates/local-supabase/index.ts').read_text())
print('LOCAL_CONFIG_READY no hosted link, no external identity or provider secret')
