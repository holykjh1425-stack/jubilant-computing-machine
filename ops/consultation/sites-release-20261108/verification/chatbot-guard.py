import hashlib
import json
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path

BASE = '379d488dd977c738904fe60c3a0f3d22884ded79'

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.controls, self.forms, self.scripts, self.refs, self.ids = [], [], [], [], set()
        self.in_script = False
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.add(a['id'])
        if tag in ['input', 'textarea', 'select', 'button', 'script']:
            self.controls.append((tag, attrs))
        if tag == 'form':
            self.forms.append(attrs)
        if tag in ['a', 'link', 'script']:
            self.refs.append(a.get('href', a.get('src', '')))
        if tag == 'script':
            self.in_script = True
    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False
    def handle_data(self, text):
        if self.in_script:
            self.scripts.append(text)

checks = []
def check(label, condition):
    assert condition, label
    checks.append({'check': label, 'result': 'PASS'})

changed = []
for name in subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASE, 'dist']).decode().splitlines():
    current = Path(name).read_bytes()
    old = subprocess.check_output(['git', 'show', BASE + ':' + name])
    if current != old:
        changed.append(name)
check('only existing homepage changed', changed == ['dist/index.html'])
old_page = Page(subprocess.check_output(['git', 'show', BASE + ':dist/index.html']).decode())
new_page = Page(Path('dist/index.html').read_text())
check('application controls and scripts unchanged', old_page.controls == new_page.controls and old_page.scripts == new_page.scripts)
check('application form attributes unchanged', old_page.forms == new_page.forms)
check('homepage contains fixed and hero chatbot links', Path('dist/index.html').read_text().count('href="consultation/"') == 2)
catalog = json.loads(Path('dist/consultation/sector-catalog.candidate.json').read_text())
routing = json.loads(Path('dist/consultation/KSIC11-21-SECTOR-ROUTING.candidate.json').read_text())
check('21 routing sections present', ''.join(sorted(routing['sections'])) == 'ABCDEFGHIJKLMNOPQRSTU')
check('all aliases refer to valid sections', all(code in routing['sections'] for code in routing['aliases'].values()))
check('unapproved sector prices removed', all(not sector['offers'] and 'monthly_maintenance_krw' not in sector for sector in catalog['sectors'].values()))
p = catalog['common_minimal_package']
check('approved conditional price values', (p['base_price_krw'], p['admin_addon_krw'], p['package_300k']['price_krw'], p['management_monthly_price_krw']) == (100000, 50000, 300000, None))
html = Path('dist/consultation/index.html').read_text()
js = Path('dist/consultation/chatbot.js').read_text()
check('strict same-origin chatbot CSP', "default-src 'none'" in html and "connect-src 'self'" in html and "form-action 'none'" in html)
check('no chatbot write API, storage or unsafe HTML sink', not re.search(r'innerHTML|outerHTML|insertAdjacentHTML|eval\(|localStorage|sessionStorage|sendBeacon|XMLHttpRequest|https?://|supabase|\.submit\(|method:\s*[\x22\x27](POST|PUT|PATCH|DELETE)', js, re.I))
check('exactly two static GET manual loads', js.count("loadJson('./") == 2 and "method:'GET'" in js and "credentials:'omit'" in js)
check('manual timeout and MIME validation', 'controller.abort()' in js and "get('content-type')" in js and '100000' in js)
for ref in Page(html).refs:
    if not ref or ref.startswith(('https:', 'mailto:', 'tel:', '#')):
        continue
    filename, _, anchor = ref.partition('#')
    target = Path('dist/consultation', filename).resolve()
    if target.is_dir():
        target /= 'index.html'
    check('local target ' + ref, target.is_file())
    if anchor:
        check('local anchor ' + ref, anchor in Page(target.read_text()).ids)
files = {}
for path in [Path('dist/index.html'), *sorted(Path('dist/consultation').glob('*'))]:
    if path.is_file():
        files[str(path)] = {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
print(json.dumps({'baseline': BASE, 'status': 'PASS', 'checks': checks, 'files': files}, ensure_ascii=False, indent=2))
