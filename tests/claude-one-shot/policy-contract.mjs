import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {POLICY,MODELS,cost} from '../../candidates/cost-control/engine.mjs';
const code=readFileSync(new URL('../../candidates/cost-control/windows-test/OneShot.cs',import.meta.url),'utf8');
assert.ok(code.includes('InputRateNano='+MODELS['claude-haiku-5-5'].input+',OutputRateNano='+MODELS['claude-haiku-5-5'].output));
assert.equal(cost('claude-haiku-5-5',1000,32),116000);
assert.ok(1e6<=POLICY.jobNano&&1e6<=POLICY.dailyNano&&1e6<=POLICY.monthlyNano);
assert.ok(code.includes('AllowAutoRedirect=false'));
assert.ok(!code.includes('CredWrite')&&!code.includes('CredEnumerate')&&!code.includes('nexus_ai_key')&&!code.includes('nexus_labs_claude_api_key'));
console.log(JSON.stringify({newPolicyContractPass:true,expectedNano:116000,reservedNano:1000000,realCalls:0}));
