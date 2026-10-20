const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
class Element {
  constructor(tag = '') { this.tag = tag; this.children = []; this.events = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.classList = { toggle() {} }; }
  append(...children) { this.children.push(...children); if (this.tag === 'select') for (const child of children) if (child.selected) this.value = child.value; }
  prepend(child) { this.children.unshift(child); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(name, fn) { this.events[name] = fn; }
  querySelector() { return new Element('button'); }
}
const elements = Object.fromEntries(['login-panel','data-panel','login-form','login-msg','data-msg','rows','refresh','logout'].map(id => [id, new Element()]));
const store = new Map(), intervals = new Map(); let intervalId = 0, updateCount = 0, updateError = null, consent = false, notifications = 0;
let eventQueue = [{ id: 1, detected_at: '2026-10-20T06:00:00Z' }];
const application = { id: 'application-1', receipt_number: 'NX-20261020-ABCDEF12', created_at: '2026-10-20T06:00:00Z', customer_name: '<img src=x>', contact: 'qa@example.invalid', service_type: 'website', description: 'QA', status: 'received' };
const db = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'admin-1' } } } }), onAuthStateChange() {}, signOut: async () => ({ error: null }) },
  from(table) {
    let isUpdate = false, next, id, expected, cursor;
    const q = {
      select() { return q; }, order() { return q; }, gt(_, v) { cursor = v; return q; },
      update(value) { isUpdate = true; next = value.status; return q; },
      eq(name, value) { if (name === 'id') id = value; if (name === 'status') expected = value; return q; },
      async limit() { return { data: table === 'applications' ? [{ ...application }] : eventQueue.filter(e => e.id > cursor), error: null }; },
      async single() { assert.ok(isUpdate); assert.equal(id, application.id); assert.equal(expected, application.status); updateCount++; if (!updateError) application.status = next; return updateError ? { data: null, error: updateError } : { data: { id }, error: null }; }
    }; return q;
  }
};
class NotificationMock { static permission = 'granted'; static requestPermission = async () => 'denied'; constructor() { notifications++; } }
const document = { title: 'Admin', hidden: false, querySelector: q => elements[q.slice(1)], createElement: tag => new Element(tag), addEventListener() {} };
const window = { NEXUS_CONFIG: { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'public-test' }, supabase: { createClient: () => db }, Notification: NotificationMock, confirm: () => consent };
const context = { window, document, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v) }, setInterval: fn => { intervals.set(++intervalId,fn); return intervalId; }, clearInterval: id => intervals.delete(id), FormData: class {} };
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  vm.runInNewContext(fs.readFileSync('admin.js','utf8'), context);
  await settle(); await settle();
  const panel = elements['data-panel']; const monitor = panel.children.find(e => e.id === 'inquiry-monitor');
  const ack = panel.children.find(e => e.textContent === '알림 확인');
  assert.match(monitor.textContent, /새 신청 알림 1건/); assert.equal(ack.hidden,false); assert.equal(notifications,1);
  await [...intervals.values()][0](); assert.equal(notifications,1); assert.equal(ack.hidden,false);
  ack.events.click(); assert.equal(ack.hidden,true); assert.equal(document.title,'Admin');
  eventQueue.push({ id: 2 }); await [...intervals.values()][0](); assert.match(monitor.textContent,/새 신청 알림 1건/); assert.equal(notifications,2);
  const row = elements.rows.children[0]; assert.equal(row.children[2].textContent,'<img src=x>');
  const select = row.children.at(-1).children[0];
  select.value = 'deposit_confirmed'; await select.events.change(); assert.equal(updateCount,0); assert.equal(select.value,'received');
  consent = true; select.value='deposit_confirmed'; await select.events.change(); assert.equal(updateCount,1); assert.equal(application.status,'deposit_confirmed');
  updateError = Error('concurrent update'); select.value='in_progress'; await select.events.change(); assert.equal(select.value,'deposit_confirmed'); assert.match(elements['data-msg'].textContent,/저장 실패/);
  await elements.logout.events.click(); assert.equal(intervals.size,0); assert.equal(elements.rows.children.length,0); assert.equal(document.title,'Admin');
  console.log('PASS: new-event alert, no duplicate notification, sticky alert/acknowledgment, second event, safe text, deposit approval/cancel, verified update, conflict rollback, logout cleanup.');
})().catch(error => { console.error(error); process.exit(1); });
