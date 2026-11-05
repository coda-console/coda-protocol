// Protocol definitions, names and the invocation envelope; no live store, scheduler or provider is involved.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Ajv from 'ajv/dist/2020.js';
import { manifestProblem } from '../validate.mjs';
import {
  AGENT_PROTOCOL, CORE_PROTOCOLS, EXECUTOR_PROTOCOL, RUN_PROTOCOL, RUN_STATES, RUN_TERMINAL_STATES,
  definitionProblem, formatProtocolName, invocationRequestProblem, invocationResponseProblem,
  ownedProtocolsProblem, parseProtocolName, protocolNameProblem, protocolShortName, runStatusProblem,
} from '../protocol.mjs';

const reference = (kind = 'coda/run@1', id = 'run-1') => ({ kind, id });
const own = { ...RUN_PROTOCOL, name: 'my-plugin/thing@1' };

test('protocol names are parsed, formatted and validated as namespace/name@major', () => {
  const parsed = parseProtocolName('my-plugin/tool-2@10');
  assert.deepEqual(parsed, { namespace: 'my-plugin', name: 'tool-2', major: 10 });
  assert.equal(formatProtocolName(parsed), 'my-plugin/tool-2@10');
  for (const name of ['coda/run@1', 'a/b@1', 'a-/b-@9', 'my-plugin/x-y@42'])
    assert.equal(formatProtocolName(parseProtocolName(name)), name);
  for (const name of ['coda/run@1', 'a/b@1']) assert.equal(protocolNameProblem(name), null);

  for (const value of [undefined, null, 1, {}, [], '', 'coda', 'coda/run', '@1', 'coda/run@', 'coda/run@0',
    'coda/run@-1', 'coda/run@1.5', 'coda/run@01', 'Coda/run@1', 'coda/Run@1', 'coda/ru_n@1', 'coda/run@1\n',
    'coda//run@1', 'coda/run/extra@1', 'coda/run@1@2', `${'a'.repeat(41)}/b@1`]) {
    assert.equal(parseProtocolName(value), null, String(value));
    assert.equal(typeof protocolNameProblem(value), 'string', String(value));
    assert.equal(formatProtocolName(value), null);
  }
  assert.equal(protocolNameProblem('Coda/run@1', '名字'), '名字：须为「命名空间/名字@大版本」：命名空间以小写字母开头，名字以小写字母或数字开头，两者只用小写字母、数字和「-」（各至多 40 个字符），大版本是正整数，短名至多 63 个字符');
  assert.equal(formatProtocolName({ namespace: 'coda', name: 'run', major: 0 }), null);
  assert.equal(formatProtocolName({ namespace: 'coda', name: 'run', major: Number.MAX_SAFE_INTEGER + 1 }), null);
});

test('short names are deterministic, DNS-safe and keep every canonical name apart', () => {
  assert.equal(protocolShortName('coda/run@1'), 'coda-1run-21');
  assert.equal(protocolShortName('my-plugin/tool@2'), 'my-0plugin-1tool-22');
  assert.equal(protocolShortName('a-/b-@9'), 'a-0-1b-0-29');
  for (const name of ['coda/run@1', 'my-plugin/tool@2', 'a-/b-@9', 'a/v1@1', 'a/v@1', 'xn--a/b@1']) {
    const short = protocolShortName(name);
    assert.match(short, /^[a-z][a-z0-9-]*[0-9]$/, name);
    assert.ok(short.length <= 63, name);
  }
  const names = ['a-b/c@1', 'a/b-c@1', 'a-/b@1', 'a/b-@1', 'a/v1@1', 'a/v@1', 'a/1@1', 'a-1/b@1'];
  assert.equal(new Set(names.map(protocolShortName)).size, names.length);
  assert.equal(protocolShortName('not a name'), null);

  const longest = `${'a'.repeat(29)}/${'b'.repeat(29)}@1`;
  assert.equal(protocolShortName(longest).length, 63);
  assert.equal(protocolNameProblem(longest), null);
  assert.equal(definitionProblem({ ...own, name: longest }), null);
  const tooLong = `${'a'.repeat(29)}/${'b'.repeat(30)}@1`;
  assert.equal(protocolShortName(tooLong), null);
  assert.equal(parseProtocolName(tooLong), null);
  assert.equal(formatProtocolName({ namespace: 'a'.repeat(29), name: 'b'.repeat(30), major: 1 }), null);
  assert.equal(typeof protocolNameProblem(tooLong), 'string');
  assert.equal(typeof definitionProblem({ ...own, name: tooLong }), 'string');
  const expandedTooLong = `${'a'.repeat(29)}/${'b'.repeat(28)}-@1`;
  assert.equal(protocolShortName(expandedTooLong), null);
  assert.equal(typeof definitionProblem({ ...own, name: expandedTooLong }), 'string');
});

test('core definitions validate, and definitions reject malformed names, operations and schemas', () => {
  for (const protocol of Object.values(CORE_PROTOCOLS)) assert.equal(definitionProblem(protocol), null, protocol.name);
  assert.deepEqual(Object.keys(CORE_PROTOCOLS), ['coda/run@1', 'coda/executor@1', 'coda/agent@1']);
  assert.equal(definitionProblem(own), null);
  assert.deepEqual(Object.keys(RUN_PROTOCOL.operations), ['cancel']);
  assert.equal(EXECUTOR_PROTOCOL.operations.execute.run, true);
  assert.equal(Object.hasOwn(EXECUTOR_PROTOCOL, 'target'), false);
  assert.deepEqual(AGENT_PROTOCOL.operations, {});

  const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
  for (const definition of [null, [], {}, without(own, 'spec'), without(own, 'status'), without(own, 'operations'),
    { ...own, future: true }, { ...own, name: 'my-plugin/thing' }, { ...own, name: 'My-Plugin/thing@1' },
    { ...own, name: 'my-plugin/thing@0' }, { ...own, spec: null }, { ...own, status: 1 }])
    assert.equal(typeof definitionProblem(definition), 'string', JSON.stringify(definition));

  for (const definition of [
    { ...own, operations: { Do: { input: {}, result: {} } } },
    { ...own, operations: { do: {} } },
    { ...own, operations: { do: { input: {}, result: {}, run: true } } },
    { ...own, operations: { do: { input: {}, run: false } } },
    { ...own, operations: { do: { input: { type: 'not-a-type' }, result: {} } } },
    { ...own, operations: { do: { input: { $ref: '#/$defs/missing' }, result: {} } } },
  ]) assert.equal(typeof definitionProblem(definition), 'string', JSON.stringify(definition));
  assert.equal(definitionProblem({ ...own, operations: { start: { input: {}, run: true } } }), null);

  assert.match(definitionProblem(own, { namespace: 'other' }), /命名空间须为「other」/);
  assert.equal(definitionProblem(own, { namespace: 'my-plugin' }), null);
});

test('a plugin owns definitions only in its own namespace', () => {
  const manifest = protocols => ({ id: 'my-plugin', name: 'my-plugin', contributes: { protocols } });
  assert.equal(ownedProtocolsProblem(manifest([own])), null);
  assert.equal(ownedProtocolsProblem({ name: 'my-plugin', contributes: {} }), null);
  assert.match(ownedProtocolsProblem(manifest([RUN_PROTOCOL])), /contributes\.protocols\[0\]\.name/);
  assert.match(ownedProtocolsProblem({ name: 'coda', contributes: { protocols: [own] } }), /coda.*保留/);
  assert.match(ownedProtocolsProblem({ contributes: { protocols: [own] } }), /id 或 name/);
  assert.match(ownedProtocolsProblem({ id: 'my-plugin', contributes: { protocols: {} } }), /须为数组/);
});

test('the manifest has the two protocol keys, with names and definitions checked', () => {
  assert.equal(manifestProblem({ id: 'my-plugin', contributes: { protocols: [own], protocolImplementations: ['coda/run@1', 'my-plugin/thing@1'] } }), null);
  assert.equal(manifestProblem({ id: 'my-plugin', contributes: { protocols: [], protocolImplementations: [] } }), null);
  for (const protocolImplementations of [[1], ['Coda/run@1'], ['coda/run@0'], ['coda/run@1', 'coda/run@1'], { name: 'coda/run@1' }])
    assert.match(manifestProblem({ contributes: { protocolImplementations } }), /protocolImplementations/);
  for (const protocols of [null, {}, [own, own], [{ ...own, name: 'bad name' }]])
    assert.match(manifestProblem({ id: 'my-plugin', contributes: { protocols } }), /protocols/);
});

test('run status is legal only when its state, result and awaiting reference agree', () => {
  const working = { state: 'working' };
  const waiting = { state: 'input-required', awaiting: reference('card', 'card-1') };
  const completed = { state: 'completed', result: { ok: true } };
  const failed = { state: 'failed', result: { code: 'failed' } };
  const canceled = { state: 'canceled' };
  for (const status of [working, waiting, completed, failed, canceled]) assert.equal(runStatusProblem(working, status), null, JSON.stringify(status));
  for (const status of [{ state: 'unknown' }, {}, { state: 'working', result: 1 }, { state: 'canceled', result: 1 },
    { state: 'input-required' }, { state: 'input-required', awaiting: reference(), result: 1 },
    { state: 'input-required', awaiting: null }, { state: 'completed' }, { state: 'failed' },
    { state: 'working', awaiting: reference() }, { state: 'completed', result: 1, awaiting: reference() }])
    assert.equal(typeof runStatusProblem(working, status), 'string', JSON.stringify(status));
  assert.deepEqual(RUN_STATES, ['working', 'input-required', 'completed', 'failed', 'canceled']);
  assert.deepEqual(RUN_TERMINAL_STATES, ['completed', 'failed', 'canceled']);
});

test('a terminal run cannot change again', () => {
  const working = { state: 'working' };
  const waiting = { state: 'input-required', awaiting: reference() };
  const completed = { state: 'completed', result: { ok: true } };
  const failed = { state: 'failed', result: { code: 'failed' } };
  const canceled = { state: 'canceled' };
  assert.equal(runStatusProblem(working, waiting), null);
  assert.equal(runStatusProblem(waiting, working), null);
  assert.equal(runStatusProblem(working, completed), null);
  for (const terminal of [completed, failed, canceled]) {
    assert.match(runStatusProblem(terminal, working), /终态/);
    assert.match(runStatusProblem(terminal, completed), /终态/);
    assert.match(runStatusProblem(terminal, terminal), /终态/);
  }
});

test('executor execute references use the git protocol names', () => {
  const execute = new Ajv({ strict: false }).compile(EXECUTOR_PROTOCOL.operations.execute.input);
  const base = { requirements: { labels: [] }, resources: {}, task: { command: 'npm', args: [] }, env: {} };
  assert.equal(execute({ ...base, source: { snapshot: { kind: 'git/snapshot@1', id: 'snapshot-1' } } }), true);
  assert.equal(execute({ ...base, source: { repository: { kind: 'git/source@1', id: 'source-1' }, commit: 'a'.repeat(40) } }), true);
  for (const source of [
    { snapshot: { kind: 'sourceSnapshot', id: 'snapshot-1' } },
    { repository: { kind: 'gitSource', id: 'source-1' }, commit: 'a'.repeat(40) },
  ]) assert.equal(execute({ ...base, source }), false);
});

test('the invocation envelope answers with exactly one of result and run', () => {
  const request = { record: reference('coda/executor@1', 'host'), operation: 'execute', input: { task: {} },
    requestId: 'request-1', parent: reference('coda/run@1', 'caller-run'), awaited: true };
  const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
  assert.equal(invocationRequestProblem(request), null);
  for (const value of [null, {}, { ...request, record: null }, { ...request, record: { kind: 'coda/executor@1' } },
    { ...request, operation: 'Execute' }, { ...request, operation: '' }, { ...request, requestId: '' },
    { ...request, requestId: 1 }, { ...request, future: true }, without(request, 'parent'), without(request, 'awaited'),
    { ...request, parent: null }, { ...request, parent: { kind: 'coda/run@1' } }, { ...request, awaited: 'true' }])
    assert.equal(typeof invocationRequestProblem(value), 'string', JSON.stringify(value));

  assert.equal(invocationResponseProblem({ result: { ok: true } }), null);
  assert.equal(invocationResponseProblem({ result: null }), null);
  assert.equal(invocationResponseProblem({ run: reference() }), null);
  for (const value of [null, {}, { result: 1, run: reference() }, { run: null },
    { run: reference(), result: 1 }, { result: 1, future: true }])
    assert.equal(typeof invocationResponseProblem(value), 'string', JSON.stringify(value));
  for (const run of [{}, { kind: 'coda/run@1' }, { kind: 'coda/run@1', id: '' }, { kind: 'coda/run@1', id: 'x', future: true }])
    assert.equal(typeof invocationResponseProblem({ run }), 'string', JSON.stringify(run));
});
