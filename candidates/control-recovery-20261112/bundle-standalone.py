from pathlib import Path
import re,sys
candidate=Path(__file__).resolve().parent;root=candidate.parents[1]
out=Path(sys.argv[1]);out.parent.mkdir(parents=True,exist_ok=True)
s=(candidate/'SOLQ_control_recovery.html').read_text()
# Bundle unchanged, pinned, public SDK/config. The candidate gates and CSP stay closed.
for target,source in [('../../vendor/supabase-2.118.0.js',root/'vendor/supabase-2.118.0.js'),('../../config.js',root/'config.js')]:
 s=s.replace(f'<script src="{target}" defer></script>','<script>'+source.read_text().replace('</script','<\\/script')+'</script>')
core=[]
for name in ['ops-core.mjs','deployment.candidate.mjs','live-ui.mjs']:
 text=(candidate/name).read_text();text=re.sub(r'^import .*?;\s*$', '',text,flags=re.M);text=re.sub(r'^export ', '',text,flags=re.M);core.append(text)
s=re.sub(r'^import .*?;\s*$', '',s,flags=re.M)
s=s.replace('<script type="module">','<script type="module">\n'+'\n'.join(core),1)
out.write_text(s)
print(out)
