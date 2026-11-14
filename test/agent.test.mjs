// The wire contract, independently of a running Coda session or an ACP SDK version.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AGENT_METHODS, AGENT_SCHEMAS, agentCapabilitiesProblem, agentMessageProblem, agentResultProblem, agentValueProblem } from '../agent.mjs';

const wait = { sessionId: 's1', waitId: 'build-1', state: 'waiting' };
const checkWait = value => agentMessageProblem('_coda/wait', value, '活动');
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));
const valueProblem = (ref, value) => agentValueProblem(ref, value, '值');

test('every wait constraint reports the field and the original checker description', () => {
  for (const value of [undefined, null, false, 1, 'x', []]) assert.equal(checkWait(value), '活动：params 须为对象');
  for (const key of ['sessionId', 'waitId']) {
    for (const value of [undefined, '', null, 2, false, [], {}])
      assert.equal(checkWait(value === undefined ? without(wait, key) : { ...wait, [key]: value }), `活动.${key}：缺 ${key}`);
  }
  for (const key of ['state']) for (const value of [undefined, 'running', '__proto__', 'constructor', null, {}, []])
    assert.equal(checkWait(value === undefined ? without(wait, key) : { ...wait, [key]: value }), `活动.state：state 只能是 waiting、handling、done、failed、cancelled`);
  const limits = { sessionId: 200, waitId: 200, kind: 50, title: 500, detail: 4000, childSessionId: 200, model: 200, outputFile: 4096, toolCallId: 200 };
  for (const [key, max] of Object.entries(limits)) {
    for (const value of ['x'.repeat(max + 1), '😀'.repeat(Math.floor(max / 2)) + 'x'])
      assert.equal(checkWait({ ...wait, [key]: value }), `活动.${key}：${key} 须为不超过 ${max} 字的文本`);
    for (const value of ['x'.repeat(max), '😀'.repeat(Math.floor(max / 2))]) assert.equal(checkWait({ ...wait, [key]: value }), null);
    if (!['sessionId', 'waitId'].includes(key)) {
      for (const value of [null, false, 1, [], {}]) assert.equal(checkWait({ ...wait, [key]: value }), `活动.${key}：${key} 须为不超过 ${max} 字的文本`);
      assert.equal(checkWait({ ...wait, [key]: '' }), null);
    }
  }
  for (const key of ['stoppable', 'recurring']) {
    for (const value of [null, 0, 'true', {}, []]) assert.equal(checkWait({ ...wait, [key]: value }), `活动.${key}：${key} 须为 true 或 false`);
    for (const value of [true, false]) assert.equal(checkWait({ ...wait, [key]: value }), null);
  }
  for (const at of ['not a time', '', null, 123, {}, []]) assert.equal(checkWait({ ...wait, at }), '活动.at：at 读不出时间');
  // Date.parse compatibility is intentional; replacing this with strict date-time would reject existing messages.
  for (const at of ['2026-10-12T10:00:00Z', '2026-10-12', 'October 12, 2026']) assert.equal(checkWait({ ...wait, at }), null);
  for (const state of ['waiting', 'handling', 'done', 'failed', 'cancelled']) assert.equal(checkWait({ ...wait, state }), null);
  for (const kind of ['task', 'subagent', 'timer', 'observation', 'future', 'constructor', '__proto__']) assert.equal(checkWait({ ...wait, kind }), null);
});

test('unrecognized reports need session, kind, name and lost; malformed ones are rejected whole', () => {
  const report = { sessionId: 's1', kind: 'output', name: 'item:agentMessage.delivery=async', lost: true };
  const check = value => agentMessageProblem('_coda/unrecognized', value, '上报');
  for (const value of [undefined, null, false, 1, 'x', []]) assert.equal(check(value), '上报：params 须为对象');
  for (const key of ['sessionId', 'name']) for (const value of [undefined, '', null, 2, false, [], {}])
    assert.equal(check(value === undefined ? without(report, key) : { ...report, [key]: value }), `上报.${key}：缺 ${key}`);
  for (const kind of [undefined, 'input', 'future', '__proto__', 'constructor', null, {}, []])
    assert.equal(check(kind === undefined ? without(report, 'kind') : { ...report, kind }), '上报.kind：kind 只能是 output 或 tool');
  for (const lost of [undefined, null, 0, 'true', {}, []])
    assert.equal(check(lost === undefined ? without(report, 'lost') : { ...report, lost }), '上报.lost：lost 须为 true 或 false');
  for (const [key, max] of Object.entries({ sessionId: 200, name: 200, detail: 2000 })) {
    for (const value of ['x'.repeat(max + 1), '😀'.repeat(Math.floor(max / 2)) + 'x'])
      assert.equal(check({ ...report, [key]: value }), `上报.${key}：${key} 须为不超过 ${max} 字的文本`);
    for (const value of ['x'.repeat(max), '😀'.repeat(Math.floor(max / 2))]) assert.equal(check({ ...report, [key]: value }), null);
  }
  for (const detail of [null, 1, false, [], {}]) assert.equal(check({ ...report, detail }), '上报.detail：detail 须为不超过 2000 字的文本');
  for (const kind of ['output', 'tool']) for (const lost of [true, false]) assert.equal(check({ ...report, kind, lost, detail: '', future: 1 }), null);
});

const messages = [
  ['_coda/wait/stop', { sessionId: 's1', waitId: 'w' }, {}],
  ['_coda/session/compact', { sessionId: 's1' }, { compacted: true, before: 100000, after: 20000 }],
  ['_coda/remote/code', { sessionId: 's1' }, { code: 'once', expiresAt: '2026-10-31T10:10:00Z', addresses: [] }],
  ['_coda/remote', { sessionId: 's1', method: 'talk', params: { text: 'hi' } }, { accepted: true }],
  ['_session/steering', { sessionId: 's1', prompt: [{ type: 'text', text: '先别改测试，只看实现' }], _meta: { steering: { idleBehavior: 'promptRequired' } } }, { outcome: 'injected' }],
];
test('the registry covers every request and notification; both sides validate without mutation', () => {
  assert.deepEqual(Object.keys(AGENT_METHODS).sort(), ['_coda/wait', '_coda/unrecognized', ...messages.map(([method]) => method)].sort());
  for (const [method, params, result] of messages) {
    const before = structuredClone({ params, result });
    assert.equal(agentMessageProblem(method, params), null);
    assert.equal(agentResultProblem(method, result), null);
    assert.deepEqual({ params, result }, before);
    for (const bad of [null, 0, 'x', []]) assert.ok(agentMessageProblem(method, bad));
    for (const key of Object.keys(params)) assert.ok(agentMessageProblem(method, without(params, key)), `${method} requires ${key}`);
    assert.ok(agentMessageProblem(method, { ...params, sessionId: '' }));
  }
  assert.equal(agentResultProblem('_coda/wait', {}), '_coda/wait result：通知没有答复');
  assert.equal(agentResultProblem('_coda/unrecognized', {}), '_coda/unrecognized result：通知没有答复');
  for (const method of ['session/prompt', '_coda/future', '__proto__', 'constructor', 'toString']) {
    assert.equal(agentMessageProblem(method, {}), `${method} params：没有这个 Coda 扩展方法`);
    assert.equal(agentResultProblem(method, {}), `${method} result：没有这个 Coda 扩展方法`);
  }
  for (const ref of ['constructor', '__proto__', 'missing.json', 'wait.json#/properties/constructor',
    'wait.json#/properties/__proto__', 'wait.json#/properties/toString', 'wait.json#/%', 'wait.json#/description',
    'wait.json#/properties/~bad', 'wait.json#/$defs/missing']) assert.equal(valueProblem(ref, {}), '值：没有这个 Agent schema');
});

test('compact answers retain finite numbers and long reasons; normalization belongs to Coda', () => {
  const method = '_coda/session/compact', check = value => agentResultProblem(method, value, '答复');
  for (const value of [null, 1, 'x', []]) assert.equal(check(value), '答复：压缩答复须为对象');
  for (const compacted of [undefined, 0, 'true', null]) assert.equal(check(compacted === undefined ? {} : { compacted }), '答复.compacted：compacted 须为 true 或 false');
  assert.equal(check({ compacted: false, reason: 1 }), '答复.reason：没压的原因，给人看');
  for (const key of ['before', 'after']) {
    for (const value of [null, '12', [], {}, Infinity, -Infinity, NaN]) assert.equal(check({ compacted: true, [key]: value }), `答复.${key}：${key} 须为有限数`);
    for (const value of [0, -1, 1.5]) assert.equal(check({ compacted: false, [key]: value }), null);
  }
  assert.equal(check({ compacted: false, reason: 'x'.repeat(5000), future: true }), null);
  assert.equal(agentResultProblem('_coda/wait/stop', null, '答复'), '答复：Agent 回 {}；回复只表示收到');
  assert.equal(agentResultProblem('_coda/wait/stop', { future: true }), null);
});

test('remote messages describe the bridge, not the agent-defined method or payload', () => {
  const check = value => agentMessageProblem('_coda/remote', value, '请求');
  const params = messages[3][1];
  for (const method of ['', 1, null, [], 'x'.repeat(201)]) assert.equal(check({ ...params, method }), '请求.method：请求须为 {method, params}');
  for (const method of ['constructor', '__proto__', 'x'.repeat(200), '😀'.repeat(100)]) assert.equal(check({ ...params, method }), null);
  for (const value of [null, [], 1, 'x']) assert.equal(check({ ...params, params: value }), '请求.params：请求须为 {method, params}');
  for (const result of [null, true, 2, 'text', ['a', {}], { result: null }]) assert.equal(agentResultProblem('_coda/remote', result), null);
  const result = messages[2][2], code = value => agentResultProblem('_coda/remote/code', value, '答复');
  for (const value of [null, [], 1, 'x']) assert.equal(code(value), '答复：绑定码答复须为对象');
  for (const [key, invalid, description] of [
    ['code', ['', 1, null, {}], '一次性的绑定码'], ['expiresAt', ['', 1, null, 'invalid'], 'expiresAt 读不出时间'],
    ['addresses', [null, {}, 'url'], 'addresses 须为入口地址的数组；不在 tailnet 时为空'],
  ]) {
    assert.equal(code(without(result, key)), `答复.${key}：${description}`);
    for (const value of invalid) assert.equal(code({ ...result, [key]: value }), `答复.${key}：${description}`);
  }
  assert.equal(code({ ...result, addresses: [1] }), '答复.addresses[0]：入口地址须为文本');
  assert.equal(code({ ...result, addresses: ['http://100.64.0.1:8080'] }), null);
});

test('capabilities are optional, extensible declarations; each known declaration must be an object', () => {
  for (const side of ['agent', 'client']) {
    for (const value of [undefined, {}, { future: true }, { coda: {} }]) assert.equal(agentCapabilitiesProblem(value, side), null);
    for (const value of [null, 0, [], 'x']) assert.equal(agentCapabilitiesProblem(value, side, '能力'), '能力：_meta 须为对象');
    for (const coda of [null, 0, [], 'x']) assert.equal(agentCapabilitiesProblem({ coda }, side, '能力'), '能力.coda：_meta.coda 须为对象');
    for (const key of side === 'agent' ? ['waits', 'remote', 'compact'] : ['waits', 'remote', 'unrecognized']) {
      assert.equal(agentCapabilitiesProblem({ coda: { [key]: { future: true } } }, side), null);
      for (const value of [null, 1, true, [], 'yes']) assert.equal(agentCapabilitiesProblem({ coda: { [key]: value } }, side, '能力'), `能力.coda.${key}：${key} 能力用对象声明（通常为 {}）`);
    }
  }
  assert.equal(agentCapabilitiesProblem({}, '__proto__', '能力'), '能力：能力声明方只能是 agent 或 client');
  assert.equal(valueProblem('default.json', { default: true }), null);
  assert.equal(valueProblem('default.json', {}), null);
  assert.equal(valueProblem('default.json', { default: 1 }), '值.default：default 须为 true 或 false；true 表示交给 Agent 自己的默认');
  assert.equal(valueProblem('default.json', []), '值：_meta.coda 须为对象');
});

test('compact display names are optional metadata beside defaults and never change option identity', () => {
  for (const value of [{}, { shortName: '审批' }, { shortName: 'Opus 4.6 [1m]', default: true, future: 1 }]) {
    assert.equal(valueProblem('display.json', value), null);
  }
  for (const shortName of ['', '   ', null, 1, [], {}]) assert.notEqual(valueProblem('display.json', { shortName }), null);
  for (const value of [null, [], 1]) assert.notEqual(valueProblem('display.json', value), null);
});

test('failure categories match agentFailure, including quota fields that are deliberately ignored', () => {
  const check = value => valueProblem('failure.json', value);
  for (const value of [null, [], 'x', 2]) assert.equal(check(value), '值：执行失败须为对象');
  for (const kind of [undefined, null, 'unknown', '__proto__', 'constructor', {}]) assert.equal(check(kind === undefined ? {} : { kind }), '值.kind：kind 只能是 quota_exhausted、service_unavailable 或 auth_required');
  for (const input of [undefined, null, true, 'unknown', {}]) assert.equal(check({ kind: 'service_unavailable', ...(input === undefined ? {} : { input }) }), '值.input：input 只能是 accepted 或 not_accepted');
  for (const retryAfterMs of [-1, Infinity, NaN, -Infinity, '1', null, {}]) assert.equal(check({ kind: 'service_unavailable', input: 'accepted', retryAfterMs }), '值.retryAfterMs：retryAfterMs 须为非负有限数');
  for (const input of ['accepted', 'not_accepted']) for (const retryAfterMs of [0, 0.5, 60001, Number.MAX_VALUE]) assert.equal(check({ kind: 'service_unavailable', input, retryAfterMs }), null);
  for (const value of [{ kind: 'quota_exhausted' }, { kind: 'quota_exhausted', input: {}, retryAfterMs: -1 }, { kind: 'service_unavailable', input: 'accepted' }]) assert.equal(check(value), null);
});

test('auth_required is a bare category with an optional login description and ignores other categories\' fields', () => {
  const check = value => valueProblem('failure.json', value);
  for (const value of [{ kind: 'auth_required' }, { kind: 'auth_required', login: 'ChatGPT 账号' }, { kind: 'auth_required', login: 'x'.repeat(200) }, { kind: 'auth_required', login: '😀'.repeat(100) },
    { kind: 'auth_required', input: 'unknown', retryAfterMs: -1, resetAt: 'unknown', future: 1 }])
    assert.equal(check(value), null);
  for (const login of ['', null, 1, true, [], {}, 'x'.repeat(201), '😀'.repeat(101)])
    assert.equal(check({ kind: 'auth_required', login }), '值.login：login 须为 1 到 200 字的文本，说明要重新登录的账号或登录方式');
  // login belongs to auth_required only; the other categories do not check it.
  for (const value of [{ kind: 'quota_exhausted', login: 1 }, { kind: 'service_unavailable', input: 'accepted', login: '' }]) assert.equal(check(value), null);
});

test('quota resetAt is optional and requires a UTC ISO 8601 timestamp', () => {
  const check = resetAt => agentValueProblem('failure.json', { kind: 'quota_exhausted', resetAt }, '值');
  for (const resetAt of ['2026-11-11T19:00:00Z', '2026-11-11T19:00:00.000Z', '2026-11-11T19:00:00.123456789Z'])
    assert.equal(check(resetAt), null);
  for (const resetAt of [null, 1, true, [], {}, '', 'not a time', '2026-11-11', 'November 11, 2026',
    '2026-11-11T19:00:00', '2026-11-11T19:00:00+08:00', '2026-11-11T19:00:00+00:00',
    '2026-13-11T19:00:00Z', '2026-11-32T19:00:00Z', '2026-11-11T24:00:00Z',
    '2026-11-11T19:60:00Z', '2026-11-11T19:00:60Z', '2026-11-11T19:00:00.1234567890Z',
    '2026-11-11T19:00:00Z\n'])
    assert.equal(check(resetAt), '值.resetAt：resetAt 须为 UTC ISO 8601 时间字符串（以 Z 结尾），表示上游给出的额度预计重置时间；没有确切时间时不写');
  assert.equal(agentValueProblem('failure.json', { kind: 'quota_exhausted' }), null);
  // This extension does not constrain unknown fields on service failures.
  for (const input of ['accepted', 'not_accepted'])
    assert.equal(agentValueProblem('failure.json', { kind: 'service_unavailable', input, resetAt: 'unknown' }), null);
});

test('review accepts unknown risks but exposes the known risk schema for host projection', () => {
  const check = value => valueProblem('review.json', value);
  for (const value of [null, [], true, 1]) assert.equal(check(value), '值：审核须为对象');
  for (const state of [undefined, null, 'unknown', '__proto__', {}]) assert.equal(check(state === undefined ? {} : { state }), '值.state：state 只能是 reviewing、approved、denied');
  for (const reason of [null, 1, {}, 'x'.repeat(4001), '😀'.repeat(2001)]) assert.equal(check({ state: 'denied', reason }), '值.reason：reason 须为不超过 4000 字的文本');
  for (const state of ['reviewing', 'approved', 'denied']) for (const risk of ['low', 'medium', 'high', 'critical', 'unknown', {}, null]) assert.equal(check({ state, risk, reason: '😀'.repeat(2000) }), null);
  for (const risk of ['low', 'medium', 'high', 'critical']) assert.equal(valueProblem('review.json#/$defs/risk', risk), null);
  assert.equal(valueProblem('review.json#/$defs/risk', 'unknown'), '值：risk 只能是 low、medium、high 或 critical');
});

test('steering validates only the Coda convention; ACP still owns prompt content blocks', () => {
  const params = messages[4][1], check = value => agentMessageProblem('_session/steering', value, '插话');
  for (const value of [{ ...params, _meta: {} }, { ...params, _meta: { steering: {} } }, { ...params, _meta: { steering: { idleBehavior: 'startNewTurn' } } }]) assert.ok(check(value));
  assert.equal(check({ ...params, _meta: { steering: { idleBehavior: false } } }), '插话._meta.steering.idleBehavior：idleBehavior 须为 promptRequired');
  for (const outcome of ['injected', 'promptRequired']) assert.equal(agentResultProblem('_session/steering', { outcome, reason: 'noRunningTurn' }), null);
  for (const outcome of [undefined, 'startedNewTurn', 'failed', null, {}]) assert.equal(agentResultProblem('_session/steering', outcome === undefined ? {} : { outcome }, '插话'), '插话.outcome：插话须回答 injected 或 promptRequired；其他结果的投递状态未知');
  for (const meta of [{}, { steering: {} }, { steering: { supported: true } }, { steering: { supported: false } }]) assert.equal(valueProblem('steering.json#/$defs/capabilities', meta), null);
  assert.equal(valueProblem('steering.json#/$defs/capabilities', { steering: { supported: 1 } }), '值.steering.supported：supported 须为 true 或 false');
});

test('usage is an opaque JSON object, bounded by serialized UTF-8 bytes', () => {
  const check = value => valueProblem('usage.json', value), bad = '值：须为不超过 4096 字节的 JSON 对象';
  for (const value of [null, [], '{}', false, 1, { a: '界'.repeat(1400) }, { a: Infinity }, { a: 1n }]) assert.equal(check(value), bad);
  const boundary = { x: 'x'.repeat(4088) };
  assert.equal(Buffer.byteLength(JSON.stringify(boundary)), 4096);
  assert.equal(check(boundary), null);
  assert.equal(check({ x: boundary.x + 'x' }), bad);
  for (const text of ['"', '\\', '\n', '😀', '\ud800']) {
    let value = '';
    while (Buffer.byteLength(JSON.stringify({ x: value + text })) <= 4096) value += text;
    assert.equal(check({ x: value }), null);
    assert.equal(check({ x: value + text }), bad);
  }
});

test('prototype names, deep objects, wide arrays and non-JSON values cannot bypass checks or crash', () => {
  const ownNames = JSON.parse('{"__proto__":{"ok":true},"constructor":{},"toString":42}');
  assert.equal(checkWait({ ...wait, ...ownNames }), null);
  assert.equal(valueProblem('usage.json', ownNames), null);
  assert.equal(agentCapabilitiesProblem({ coda: ownNames }), null);
  const inherited = Object.create(wait);
  assert.equal(checkWait(inherited), '活动.sessionId：缺 sessionId');
  let deep = {};
  for (let i = 0; i < 20000; i++) deep = { next: deep };
  assert.equal(agentResultProblem('_coda/remote', deep), null);
  assert.equal(checkWait({ ...wait, extra: deep }), null);
  assert.equal(checkWait({ ...wait, title: deep }), '活动.title：title 须为不超过 500 字的文本');
  assert.equal(valueProblem('usage.json', deep), '值：须为不超过 4096 字节的 JSON 对象');
  const wide = Array(200000).fill(0);
  assert.equal(agentResultProblem('_coda/remote', wide), null);
  assert.equal(valueProblem('usage.json', { wide }), '值：须为不超过 4096 字节的 JSON 对象');
  const cycle = {}; cycle.self = cycle;
  for (const value of [cycle, Infinity, NaN, -Infinity, undefined, 1n, new Date(), { a: undefined }, { a: () => {} }])
    assert.equal(agentResultProblem('_coda/remote', value, '答复'), '答复：须为 JSON 值（数字须有限，不能循环引用）');
  assert.equal(valueProblem('usage.json', cycle), '值：须为不超过 4096 字节的 JSON 对象');
  const shared = { x: 1 };
  assert.equal(agentResultProblem('_coda/remote', [shared, shared]), null);
});

test('documentation wire examples remain valid for the extension parts', () => {
  const doc = readFileSync(new URL('../docs/agent-protocol.md', import.meta.url), 'utf8');
  let checked = 0;
  for (const line of doc.split('\n')) {
    if (!line.startsWith('{"jsonrpc"')) continue;
    const message = JSON.parse(line);
    if (Object.hasOwn(AGENT_METHODS, message.method ?? '')) { assert.equal(agentMessageProblem(message.method, message.params), null); checked++; }
    const failure = message.error?.data?._meta?.coda?.failure;
    if (failure) { assert.equal(valueProblem('failure.json', failure), null); checked++; }
    const update = message.params?.update;
    if (update?._meta?.coda) { assert.equal(valueProblem(update.sessionUpdate === 'usage_update' ? 'usage.json' : 'review.json', update.sessionUpdate === 'usage_update' ? update._meta.coda : update._meta.coda.review), null); checked++; }
  }
  assert.ok(checked >= 10);
  for (const [file, schema] of Object.entries(AGENT_SCHEMAS)) assert.equal(schema.$id, `https://coda.pub/schemas/agent/v1/${file}`);
});

test('pinned Coda and plugin-check fixtures agree on shape, independently of session state', () => {
  const corpus = JSON.parse(readFileSync(new URL('./fixtures/agent-messages.json', import.meta.url), 'utf8'));
  for (const { source, part, ref, value, problem } of corpus.cases) {
    const check = part === 'params' ? agentMessageProblem : part === 'result' ? agentResultProblem : agentValueProblem;
    assert.equal(check(ref, value, '值'), problem, `${source}: ${ref}`);
  }
});
