import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(new URL('../review/01_schema.REVIEW_ONLY.sql', import.meta.url), 'utf8');
const teardown = await readFile(new URL('../review/02_rollback.REVIEW_ONLY.sql', import.meta.url), 'utf8');

// Lexical balance only. PostgreSQL parsing and PL/pgSQL compilation are separate test gates.
function verifyLexicalBalance(source) {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    if (source.startsWith('--', i)) {
      const end = source.indexOf('\n', i);
      if (end < 0) break;
      i = end;
    } else if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      assert.ok(end !== -1);
      i = end + 1;
    } else if (source[i] === "'") {
      const escaped = /[Ee]/.test(source[i - 1] ?? '');
      let j = i + 1;
      for (; j < source.length; j++) {
        if (source[j] === '\\' && escaped) { j++; continue; }
        if (source[j] !== "'") continue;
        if (source[j + 1] !== "'") break;
        j++;
      }
      assert.ok(j < source.length, 'unclosed string');
      i = j;
    } else if (source[i] === '$') {
      const tag = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
      if (!tag) continue;
      const end = source.indexOf(tag, i + tag.length);
      assert.ok(end >= 0, 'unclosed dollar quote');
      verifyLexicalBalance(source.slice(i + tag.length, end));
      i = end + tag.length - 1;
    } else if (source[i] === '(') {
      depth++;
    } else if (source[i] === ')') {
      depth--;
      assert.ok(depth >= 0);
    }
  }
  assert.equal(depth, 0, 'unbalanced parentheses');
}

test('both scripts are lexically balanced, target-gated and limited to review transactions', () => {
  for (const s of [sql, teardown]) {
    verifyLexicalBalance(s);
    assert.match(s, /REVIEW_ONLY \/ NOT_APPLIED/);
    assert.match(s, /current_database\(\) <> 'solq_dev02_synthetic'/);
    assert.match(s, /current_setting\('solq.dev02_scope', true\)/);
    assert.match(s, /rollback;\s*$/);
    assert.doesNotMatch(s, /^\s*commit;/im);
  }
});

test('reviewed case model combines immutable origin, owner-key uniqueness and two consent checks', () => {
  assert.match(sql, /unique \(owner_id, request_id\)/);
  assert.match(sql, /unique \(receipt_number\)/);
  assert.match(sql, /primary key \(application_id, kind\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /on conflict on constraint dev02_receipt_uq do nothing/);
  assert.match(sql, /stored_doc is distinct from consent_doc/);
  assert.doesNotMatch(sql, /grant (?:update|delete)[^;]*solq_dev02_private\.application/i);
});

test('reviewed routes scope execution, actor lease and least-privilege RLS', () => {
  const definitions = sql.match(/security definer[^\n]+/g);
  assert.equal(definitions?.length, 4);
  assert.ok(definitions.every(s => s.includes('search_path = pg_catalog, pg_temp')));
  assert.match(sql, /l\.session_id::text = auth\.jwt\(\)->>'session_id'/);
  assert.match(sql, /l\.revoked_at is null and l\.expires_at > statement_timestamp\(\)/);
  for (const name of ['application', 'consent', 'workflow']) {
    assert.match(sql, new RegExp('alter table solq_dev02_private\\.' + name + ' force row level security'));
  }
  assert.match(sql, /revoke all on all functions in schema solq_dev02_api, solq_dev02_private/);
  assert.doesNotMatch(sql, /grant (?:select|update|insert|execute)[^;]+ to anon(?:[;,\s])/i);
  assert.match(sql, /return jsonb_build_object\('allowed', false, 'reason', reason\)/);
});

test('reviewed private Storage policies are scoped and teardown refuses retained data', () => {
  assert.match(sql, /values \('solq-dev02-fixture', 'solq-dev02-fixture', false\)/);
  for (const operation of ['insert', 'update', 'delete']) {
    assert.match(sql, new RegExp('create policy dev02_storage_no_' + operation + ' on storage.objects as restrictive'));
  }
  assert.match(teardown, /exists \(select 1 from storage\.objects where bucket_id = 'solq-dev02-fixture'\)/);
  assert.match(teardown, /delete from storage\.buckets where id = 'solq-dev02-fixture' and not public/);
  assert.doesNotMatch(teardown, /\b(?:cascade|truncate|drop role)\b/i);
  assert.match(teardown, /drop schema solq_dev02_private restrict/);
});
