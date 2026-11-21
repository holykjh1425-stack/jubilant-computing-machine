'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const waitMs = ms => new Promise(resolve => setTimeout(resolve, ms));
const chrome = process.argv[2] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const report = { mode: 'offline file URL, synthetic data', results: [], browserErrors: [], externalRequests: [], profileRemoved: false };

// The local SOLQ browser harness uses a debugging pipe rather than a TCP port.
function openBrowser(profile) {
  const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-extensions', '--disable-default-apps', '--remote-debugging-pipe',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true });
  let counter = 0;
  let buffer = '';
  const pending = new Map();
  const rejectPending = err => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(err); }
    pending.clear();
  };
  child.on('error', rejectPending);
  child.on('exit', () => rejectPending(Error('Browser closed')));
  child.stdio[3].on('error', rejectPending);
  child.stdio[4].setEncoding('utf8').on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const packet = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (pending.has(packet.id)) {
        const waiter = pending.get(packet.id);
        pending.delete(packet.id);
        clearTimeout(waiter.timer);
        if (packet.error) waiter.reject(Error(packet.error.message));
        else waiter.resolve(packet.result);
      } else if (packet.method === 'Runtime.exceptionThrown') report.browserErrors.push(packet.params.exceptionDetails.text);
      else if (packet.method === 'Network.requestWillBeSent' && /^(https?|wss?):/.test(packet.params.request.url)) {
        report.externalRequests.push(new URL(packet.params.request.url).origin);
      }
    }
  });
  function send(method, params = {}, sessionId) {
    const id = ++counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Error('Browser timeout: ' + method)); }, 10000);
      pending.set(id, { resolve, reject, timer });
      child.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
  }
  return { child, send, closed: new Promise(resolve => child.once('close', resolve)) };
}

async function check(name, fn) {
  try {
    await fn();
    report.results.push({ name, status: 'PASS' });
  } catch (e) {
    report.results.push({ name, status: 'FAIL', reason: e.message });
    throw e;
  }
}

async function main() {
  const temp = await fs.realpath(os.tmpdir());
  const profile = await fs.mkdtemp(path.join(temp, 'solq-portal-dev01-chrome-'));
  const browser = openBrowser(profile);
  try {
    report.browser = (await browser.send('Browser.getVersion')).product;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const cdp = (method, params) => browser.send(method, params, sessionId);
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Network.enable');
    await cdp('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] });
    async function js(expression) {
      const value = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (value.exceptionDetails) throw Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
      return value.result.value;
    }
    async function poll(expression) {
      for (let i = 0; i < 60; i++) {
        if (await js(expression)) return;
        await waitMs(60);
      }
      throw Error('UI assertion timed out: ' + expression);
    }
    const node = s => 'document.querySelector(' + JSON.stringify(s) + ')';
    const click = s => js(node(s) + '.click()');
    const text = s => js(node(s) + '.textContent');
    const write = (s, v) => js(node(s) + '.value=' + JSON.stringify(v));
    const status = part => poll(node('#status') + '.textContent.includes(' + JSON.stringify(part) + ')');
    async function selectRole(role) {
      await write('#persona', role);
      await js(node('#persona') + '.dispatchEvent(new Event("change",{bubbles:true}))');
      await status('역할을 전환');
      await poll('!' + node('#persona') + '.disabled');
    }
    const open = () => cdp('Page.navigate', { url: pathToFileURL(path.join(__dirname, '..', 'index.html')).href });
    const action = name => click('button[data-action="' + name + '"]');
    const submit = () => js(node('#intake-form') + '.requestSubmit()');
    const lookup = async receipt => {
      await write('#receipt', receipt);
      await js(node('#lookup-form') + '.requestSubmit()');
    };
    let receipt;
    await check('데스크톱 상담과 6단계 계획', async () => {
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await open();
      await status('합성 상담을 시작');
      assert.equal(await js('document.documentElement.scrollWidth'), 1440);
      await selectRole('a');
      await click('#example');
      assert.equal(await js('document.querySelectorAll("#preview-steps li").length'), 6);
      assert.equal(await js(node('#intake-form') + '.hidden'), false);
    });
    await check('한쪽 동의 누락 및 저장 후 응답 유실', async () => {
      await click('#privacy');
      await submit();
      await status('동의 항목');
      assert.equal(await text('#confirmation'), '');
      await click('#transfer');
      await write('#fault', 'after');
      await submit();
      await status('저장 결과를 확인할 수 없습니다');
      assert.equal(await text('#confirmation'), '');
      await write('#fault', 'normal');
      await submit();
      await status('기존 접수번호를');
      receipt = await js(node('#confirmation') + '.dataset.receipt');
      assert.match(receipt, /^NX-[0-9]{8}-[A-F0-9]{8}$/);
    });
    await check('고객 B 조회 차단 및 관리자 무료 계획·견적', async () => {
      await selectRole('b');
      await lookup(receipt);
      await status('조회할 수 있는 접수가 없습니다');
      assert.equal(await js(node('#record') + '.hidden'), true);
      await selectRole('admin');
      assert.equal(await js('document.querySelectorAll("#list button").length'), 1);
      await action('open-record');
      await status('조회했습니다');
      await action('plan');
      await status('무료 계획 생성 처리 완료');
      await action('quote');
      await status('견적 발행 처리 완료');
      assert.match(await text('#record'), /견적 v1 · 100,000원/);
    });
    await check('고객 동의, 입금·별도 승인 전 차단 및 실행 비활성', async () => {
      await selectRole('a');
      await lookup(receipt);
      await status('조회했습니다');
      await action('accept');
      await status('현재 견적 동의 처리 완료');
      await selectRole('admin');
      await lookup(receipt);
      await status('조회했습니다');
      await action('checkExecution');
      await status('수동 입금 확인이 필요');
      await action('deposit');
      await status('모의 입금 확인 처리 완료');
      await action('checkExecution');
      await status('별도 제작 승인이 필요');
      await action('approve');
      await status('별도 제작 승인 처리 완료');
      await action('checkExecution');
      await status('실제 제작과 외부 발송은 비활성');
    });
    await check('390px 모바일 상담과 접수 폼', async () => {
      await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
      await open();
      await status('합성 상담을 시작');
      await selectRole('a');
      await click('#example');
      assert.equal(await js('document.documentElement.clientWidth'), 390);
      assert.equal(await js('document.documentElement.scrollWidth'), 390);
      await click('#privacy');
      await click('#transfer');
      await submit();
      await status('합성 신청이 저장됐습니다');
      assert.match(await text('#confirmation'), /저장 확인/);
      await click('#new-request');
      await status('새 합성 신청을 준비했습니다');
      assert.equal(await js(node('#privacy') + '.checked || ' + node('#transfer') + '.checked'), false);
    });
    await check('브라우저 오류와 외부 요청 0건', async () => {
      assert.deepEqual(report.browserErrors, []);
      assert.deepEqual(report.externalRequests, []);
      assert.equal(await js('localStorage.length + sessionStorage.length'), 0);
    });
  } finally {
    try { await browser.send('Browser.close'); } catch { browser.child.kill(); }
    const closed = await Promise.race([browser.closed.then(() => true), waitMs(3000).then(() => false)]);
    if (!closed) { browser.child.kill(); await browser.closed; }
    const resolved = await fs.realpath(profile);
    assert.equal(path.dirname(resolved).toLowerCase(), temp.toLowerCase());
    assert.match(path.basename(resolved), /^solq-portal-dev01-chrome-/);
    await fs.rm(resolved, { recursive: true, maxRetries: 3 });
    report.profileRemoved = true;
  }
}

main().catch(e => {
  report.error = e.message;
  process.exitCode = 1;
}).finally(() => console.log(JSON.stringify(report)));
