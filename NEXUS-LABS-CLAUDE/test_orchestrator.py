import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from orchestrator import Blocked, Engine, MAX_OUTPUT, Providers

ENV = dict(NEXUS_LIVE_ENABLED='true', NEXUS_PRICING_VERIFIED='true',
           OPENAI_API_KEY='test-only', ANTHROPIC_API_KEY='test-only',
           OPENAI_MODEL='test-openai', ANTHROPIC_MODEL='test-claude',
           OPENAI_INPUT_MICRO_USD_PER_TOKEN='1', OPENAI_OUTPUT_MICRO_USD_PER_TOKEN='2',
           ANTHROPIC_INPUT_MICRO_USD_PER_TOKEN='1', ANTHROPIC_OUTPUT_MICRO_USD_PER_TOKEN='2',
           NEXUS_MONTHLY_MICRO_USD='1000000', NEXUS_JOB_MICRO_USD='1000000')

class Fake:
    def __init__(self, fail=False): self.calls = []; self.fail = fail
    def call(self, provider, prompt):
        self.calls.append(provider)
        if self.fail: raise Blocked('network_outcome_unknown')
        return '검토된 초안', (20, 10)

class Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.fake = Fake()
        self.e = Engine(self.temp.name, ENV, self.fake)
    def tearDown(self):
        self.e.db.close(); self.temp.cleanup()
    def job(self): return self.e.submit('개인정보 없는 홈페이지 소개 초안', 'test-key')
    def test_pipeline_and_bound_approval(self):
        job = self.job(); result = self.e.run(job)
        self.assertEqual(self.fake.calls, ['openai', 'anthropic', 'openai'])
        self.assertEqual(result['status'], 'awaiting_approval')
        with self.assertRaises(Blocked): self.e.approve(job, 'wrong', 'owner', 'approved')
        self.assertEqual(self.e.approve(job, result['result_hash'], 'owner', 'approved')['status'], 'approved')
        with self.assertRaises(Blocked): self.e.approve(job, result['result_hash'], 'owner', 'approved')
        with self.assertRaises(Blocked): self.e.run(job)
    def test_default_blocks_before_network(self):
        self.e.env = {}; job = self.job()
        with self.assertRaisesRegex(Blocked, 'live_disabled'): self.e.run(job)
        self.assertEqual(self.e.get(job)['status'], 'queued'); self.assertFalse(self.fake.calls)
    def test_no_keys(self):
        del self.e.env['ANTHROPIC_API_KEY']
        with self.assertRaisesRegex(Blocked, 'missing_model_or_secret'): self.e.run(self.job())
        self.assertFalse(self.fake.calls)
    def test_idempotency_and_conflict(self):
        job = self.job(); self.assertEqual(job, self.job())
        with self.assertRaisesRegex(Blocked, 'idempotency_conflict'): self.e.submit('other', 'test-key')
    def test_zero_and_small_budget(self):
        self.e.env['NEXUS_MONTHLY_MICRO_USD'] = '1'
        job = self.job()
        with self.assertRaisesRegex(Blocked, 'budget_exceeded'): self.e.run(job)
        self.assertFalse(self.fake.calls)
    def test_job_budget(self):
        self.e.env['NEXUS_JOB_MICRO_USD'] = '1'
        with self.assertRaisesRegex(Blocked, 'budget_exceeded'): self.e.run(self.job())
        self.assertFalse(self.fake.calls)
    def test_unknown_charge_retains_reservation_no_retry(self):
        self.fake.fail = True; job = self.job()
        with self.assertRaisesRegex(Blocked, 'network_outcome_unknown'): self.e.run(job)
        self.assertGreater(self.e.status()['reservations'][0]['reserved_micro_usd'], 0)
        with self.assertRaisesRegex(Blocked, 'job_not_queued'): self.e.run(job)
        self.assertEqual(len(self.fake.calls), 1)
    def test_other_process_cannot_run_same_job(self):
        job = self.job(); self.e.run(job)
        other = Engine(self.temp.name, ENV, self.fake)
        try:
            with self.assertRaisesRegex(Blocked, 'job_not_queued'): other.run(job)
        finally: other.db.close()
        self.assertEqual(len(self.fake.calls), 3)
    def test_persistence_of_budget_and_approval(self):
        job = self.job(); result = self.e.run(job)
        other = Engine(self.temp.name, ENV, self.fake)
        try:
            self.assertEqual(other.get(job)['result_hash'], result['result_hash'])
            self.assertEqual(other.status()['reservations'], self.e.status()['reservations'])
        finally: other.db.close()
    def test_runtime_forbidden_inside_repo(self):
        with self.assertRaisesRegex(Blocked, 'outside_repository'):
            Engine(Path(__file__).parent / '.runtime', ENV)
    def test_observed_overrun_halts_future_jobs(self):
        self.fake.call = lambda *args: ('draft', (100000, 100000))
        with self.assertRaisesRegex(Blocked, 'budget_estimate_exceeded_halted'): self.e.run(self.job())
        other = self.e.submit('new task', 'other-key')
        with self.assertRaisesRegex(Blocked, 'budget_overrun_requires_operator_review'): self.e.run(other)
    def test_rejection_cannot_be_run(self):
        job = self.job(); result = self.e.run(job)
        self.e.approve(job, result['result_hash'], 'owner', 'rejected')
        with self.assertRaises(Blocked): self.e.run(job)
    def test_input_guard(self):
        for task in ['sk-secret', '가' * 4000, '']:
            with self.assertRaises(Blocked): self.e.submit(task, 'new')
    def test_unverified_prices_blocked(self):
        self.e.env['NEXUS_PRICING_VERIFIED'] = 'false'
        with self.assertRaisesRegex(Blocked, 'verify_model_prices'): self.e.run(self.job())
    def test_crashed_job_not_replayed(self):
        job = self.job()
        with self.e.db: self.e.db.execute("UPDATE jobs SET status='running' WHERE id=?", (job,))
        with self.assertRaisesRegex(Blocked, 'job_not_queued'): self.e.run(job)
        self.assertFalse(self.fake.calls)

class WireTests(unittest.TestCase):
    def test_both_provider_payloads_and_no_secrets_in_body(self):
        p = Providers(ENV)
        class Opener:
            def open(self, request, timeout):
                self.request = request
                if 'openai.com' in request.full_url:
                    return io.BytesIO(json.dumps(dict(status='completed', usage=dict(input_tokens=2, output_tokens=3), output=[dict(type='message', content=[dict(type='output_text', text='ok')])])).encode())
                return io.BytesIO(json.dumps(dict(stop_reason='end_turn', usage=dict(input_tokens=2, output_tokens=3), content=[dict(type='text', text='ok')])).encode())
        p.opener = Opener()
        for name in ['openai', 'anthropic']:
            self.assertEqual(p.call(name, 'test'), ('ok', (2, 3)))
            body = json.loads(p.opener.request.data)
            self.assertNotIn('test-only', p.opener.request.data.decode())
            self.assertNotIn('tools', body)
            self.assertEqual(body.get('max_tokens', body.get('max_output_tokens')), MAX_OUTPUT)
        p.opener.open = lambda *a, **k: (_ for _ in ()).throw(urllib.error.HTTPError('url', 429, 'secret', {}, None))
        with self.assertRaisesRegex(Blocked, '^rate_or_credit_limit$'): p.call('openai', 'test')

if __name__ == '__main__': unittest.main()
