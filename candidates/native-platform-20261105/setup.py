import os,pathlib,re,runpy,subprocess,tomllib
assert os.environ.get('GITHUB_ACTIONS')=='true','disposable GitHub runner required'
assert not os.environ.get('SUPABASE_ACCESS_TOKEN'),'hosted credentials forbidden'
existing=subprocess.run(['docker','ps','-aq','--filter','name=supabase_db_solq-local-ci'],text=True,capture_output=True,check=True).stdout.strip()
assert not existing,'do not reuse another stack'
runpy.run_path('tests/local-supabase/setup.py',run_name='__main__')
work=pathlib.Path(os.environ['SOLQ_STACK_DIR']);config=work/'supabase/config.toml'
text=config.read_text();text=re.sub(r'(?m)^major_version\s*=.*$','major_version = 17',text)
config.write_text(text);assert tomllib.loads(text)['db']['major_version']==17
function=work/'supabase/functions/solq-local-plan'
function.joinpath('index.ts').write_text(pathlib.Path('supabase/functions/solq-quote-evidence/index.ts').read_text())
function.joinpath('handler.mjs').write_text(pathlib.Path('supabase/functions/solq-quote-evidence/handler.mjs').read_text())
print('NATIVE_CONFIG_READY PG17; genuine services; synthetic data only')
