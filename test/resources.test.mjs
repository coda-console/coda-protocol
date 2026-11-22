// The check of `coda/resource@1` records (validate.mjs `resourceRecordsProblem`): what a plugin's record command prints held to
// the protocol's schema and to the limits Coda holds records to.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resourceRecordsProblem } from '../validate.mjs';

const ENTRY = 64 * 1024, ARGS = 4096;
// A record of the type `type`, with the resources given.
const record = (resources, type = 'acme') => ({ key: type, spec: { type, title: 'Acme', resources } });
const resource = (extra = {}) => ({ name: 'main', values: [{ label: '额度', value: '剩余 50%', fraction: 0.5 }], buttons: [], ...extra });
const button = extra => resource({ buttons: [{ label: '切换', action: 'switch', ...extra }] });
const valid = [record([resource(), button({ args: { account: 'a' } }), button({ action: undefined, view: 'accounts' }), button({ action: undefined, url: 'https://example.com' })]),
  { key: 'bare', spec: { type: 'bare', title: 'Bare', resources: [], signIn: { installed: false, installable: true, note: '先装' } },
    status: {}, labels: { group: 'a' } }];

describe('resourceRecordsProblem', () => {
  test('records the protocol takes have no problem', () => {
    assert.equal(resourceRecordsProblem(valid), null);
    assert.equal(resourceRecordsProblem([]), null, 'no type signed in is no record');
    assert.equal(resourceRecordsProblem([{ ...record([]), labels: null }]), null);
  });
  test('the output is an array of objects', () => {
    for (const output of [{ resources: [] }, null, 'x', 1, undefined]) assert.equal(resourceRecordsProblem(output), '记录须为数组');
    for (const one of [null, 'x', 1, [], [record([])]]) assert.match(resourceRecordsProblem([one]), /^第 1 条记录须为 \{ key, spec/);
  });
  test('a record has no id, and a key of 1–256 characters without NUL, once', () => {
    assert.match(resourceRecordsProblem([{ ...record([]), id: 'x' }]), /第 1 条记录不能写 id/);
    assert.match(resourceRecordsProblem([{ ...record([]), id: undefined }]), /不能写 id/);
    assert.match(resourceRecordsProblem([{ spec: record([]).spec }]), /第 1 条记录的 key 须为 1–256 个字符、不含 NUL 的文本，不是 undefined/);
    for (const key of ['', 'a'.repeat(257), 'a\0b', 1, null]) assert.match(resourceRecordsProblem([{ ...record([]), key }]), /的 key 须为 1–256 个字符/);
    const long = 'a'.repeat(256);
    // 256 characters is a key; the type, which is the key, is a name of at most 64, which the schema says.
    assert.match(resourceRecordsProblem([{ key: long, spec: { type: long, title: 'Acme', resources: [] } }]), /spec/);
    assert.match(resourceRecordsProblem([record([]), record([])]), /第 2 条记录的 key 重复：acme/);
  });
  test('only spec, status and labels besides the key', () => {
    assert.match(resourceRecordsProblem([{ ...record([]), extra: 1 }]), /第 1 条记录（acme） 里有不认识的键：extra/);
    assert.match(resourceRecordsProblem([{ ...record([]), kind: 'coda/resource@1' }]), /不认识的键：kind/);
  });
  test('labels, when written, are null or an object of texts', () => {
    for (const labels of [[], 'a', 1, true, { a: 1 }, { a: null }, { a: 'b', c: {} }]) assert.match(resourceRecordsProblem([{ ...record([]), labels }]), /第 1 条记录（acme）：labels 须为 null 或值为文本的对象/);
    assert.equal(resourceRecordsProblem([{ ...record([]), labels: {} }]), null);
    assert.match(resourceRecordsProblem([{ ...record([]), labels: undefined }]), /第 1 条记录（acme）：labels 须为 null 或值为文本的对象/, 'written as undefined is not unwritten');
    assert.equal(resourceRecordsProblem([record([])]), null, 'unwritten is none');
  });
  test('a record without a type fails, and its type is its key', () => {
    assert.match(resourceRecordsProblem([{ key: 'acme', spec: { title: 'Acme', resources: [] } }]), /第 1 条记录（acme） spec 缺 type/);
    assert.match(resourceRecordsProblem([{ ...record([], 'other'), key: 'acme' }]), /第 1 条记录（acme）：spec.type（other）须与 key 相同/);
    assert.match(resourceRecordsProblem([{ key: 'acme' }]), /第 1 条记录（acme） spec/);
    assert.match(resourceRecordsProblem([{ key: 'acme', spec: [] }]), /第 1 条记录（acme） spec/);
  });
  test('a status, when written, is the protocol\'s', () => {
    assert.equal(resourceRecordsProblem([{ ...record([]), status: {} }]), null);
    assert.match(resourceRecordsProblem([{ ...record([]), status: 'ok' }]), /第 1 条记录（acme） status/);
    assert.match(resourceRecordsProblem([{ ...record([]), status: { unknown: 1 } }]), /第 1 条记录（acme） status/);
  });
  test('the second record is judged as the first is, by its place', () => {
    assert.match(resourceRecordsProblem([record([], 'one'), { ...record([], 'two'), status: 1 }]), /第 2 条记录（two） status/);
  });
  test('a resource, a reading and a button as the schema has them', () => {
    assert.match(resourceRecordsProblem([record([{ values: [], buttons: [] }])]), /spec\.resources\[0\] 缺 name/);
    assert.match(resourceRecordsProblem([record([resource({ buttons: undefined })])]), /缺 buttons/);
    assert.match(resourceRecordsProblem([record([resource({ values: [{ value: '1', fraction: 2 }] })])]), /values\[0\]\.fraction/);
    assert.match(resourceRecordsProblem([record([resource({ actions: [] })])]), /不认识的键：actions/);
  });
  test('a button is one of action, view and url', () => {
    const problem = buttons => resourceRecordsProblem([record([resource({ buttons })])]);
    assert.match(problem([{ label: '没有' }]), /buttons\[0\] 缺 action：.*三选一/);
    assert.match(problem([{ label: '两个', action: 'a', view: 'v' }]), /buttons\[0\]：.*三选一/);
    assert.match(problem([{ label: '链接带参数', url: 'https://example.com', args: {} }]), /三选一/);
    assert.match(problem([{ label: '明文链接', url: 'http://example.com' }]), /buttons\[0\]/);
    assert.equal(problem([{ label: '动作带参数与确认', action: 'a', args: { n: 1 }, confirm: '确定？', disabled: true }]), null);
  });
  test('args are at most 4096 bytes serialized, counted in bytes, not characters', () => {
    const at = args => resourceRecordsProblem([record([button({ args })])]);
    // `{"x":"…"}` is 8 bytes around the text.
    assert.equal(at({ x: 'a'.repeat(ARGS - 8) }), null);
    assert.match(at({ x: 'a'.repeat(ARGS - 7) }), /第 1 条记录（acme）：spec\.resources\[0\]\.buttons\[0\]\.args 序列化后 4097 字节，超过 4096 字节/);
    // A character of 汉 is three bytes: 1362 of them are 4094 bytes with the rest, 1363 are 4097.
    assert.equal(at({ x: '汉'.repeat(1362) }), null);
    assert.match(at({ x: '汉'.repeat(1363) }), /args 序列化后 4097 字节/);
    assert.match(resourceRecordsProblem([record([resource(), button({ args: { x: 'a'.repeat(ARGS) } })])]), /resources\[1\]\.buttons\[0\]\.args/);
  });
  test('a record is at most 64 KiB serialized, said by its place in the array', () => {
    // Many resources of long names stay inside the schema's limits, and of arguments within theirs, but not within the limit.
    const wide = name => record(Array.from({ length: 50 }, () => button({ args: { x: name } })), 'wide');
    const room = ENTRY - Buffer.byteLength(JSON.stringify(wide('')));
    assert.equal(resourceRecordsProblem([record([], 'small'), wide('a'.repeat(Math.floor(room / 50)))]), null);
    assert.equal(resourceRecordsProblem([record([], 'small'), wide('a'.repeat(Math.floor(room / 50) + 1))]), '第 2 条记录超过 64 KiB');
    // Counted in bytes, and before anything else of the record is judged.
    assert.equal(resourceRecordsProblem([{ ...record([]), id: 'x'.repeat(ENTRY) }]), '第 1 条记录超过 64 KiB');
    assert.equal(resourceRecordsProblem([{ ...record([]), labels: { a: '汉'.repeat(ENTRY / 3) } }]), '第 1 条记录超过 64 KiB');
  });
  test('what cannot be serialized is said, not thrown', () => {
    const circular = record([]);
    circular.spec.self = circular;
    assert.match(resourceRecordsProblem([circular]), /^第 1 条记录无法序列化为 JSON：/);
    assert.match(resourceRecordsProblem([record([]), { ...record([], 'big'), labels: { n: 1n } }]), /^第 2 条记录无法序列化为 JSON：/);
    assert.match(resourceRecordsProblem([{ ...record([]), toJSON() { throw new Error('不给'); } }]), /^第 1 条记录无法序列化为 JSON：不给/);
    // Whatever a `toJSON` throws is said, never thrown on and never taken for no problem.
    for (const thrown of [null, undefined, new Error(), '', 0, {}, Object.create(null), Symbol('s')])
      assert.equal(resourceRecordsProblem([{ ...record([]), toJSON() { throw thrown; } }]) === null, false);
    assert.equal(resourceRecordsProblem([{ ...record([]), toJSON() { throw null; } }]), '第 1 条记录无法序列化为 JSON：抛出了 null');
    assert.equal(resourceRecordsProblem([{ ...record([]), toJSON() { throw new Error(); } }]), '第 1 条记录无法序列化为 JSON：Error');
    assert.equal(resourceRecordsProblem([{ ...record([]), toJSON() { throw 'no'; } }]), '第 1 条记录无法序列化为 JSON：no');
    // A key that is not text is named without being serialized again: one that cannot be would otherwise throw here.
    let calls = 0;
    const key = { toJSON() { if (calls++) throw new Error('二次'); return 'k'; } };
    assert.match(resourceRecordsProblem([{ ...record([]), key }]), /^第 1 条记录的 key 须为 1–256 个字符、不含 NUL 的文本，不是 /);
    assert.match(resourceRecordsProblem([{ ...record([]), key: { toJSON: () => { throw null; } } }]), /^第 1 条记录无法序列化为 JSON：抛出了 null$/, 'a key that never serializes fails with the record');
  });
});
