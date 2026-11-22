// The plugin types (plugin.d.mts, `@coda-console/protocol/types`): which are there, that they are shipped and exported, and that
// nothing of a test host is in them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../plugin.d.mts'), manifest = JSON.parse(read('../package.json'));
const declared = [...source.matchAll(/^export (?:type|interface|declare \w+|const|function|class) (\w+)/gm)].map(([, name]) => name);

test('the public types of a plugin are all declared', () => {
  for (const name of ['Json', 'Ref', 'KeyRef', 'HandledRef', 'Effects', 'BlobPointer', 'CallError', 'QueryOptions', 'CallOptions', 'Caller', 'Context',
    'Handler', 'StreamCaller', 'ServeContext', 'StreamContext', 'ServeHandler', 'StreamHandler', 'Interrupted', 'Resume', 'Disposable',
    'SpawnOptions', 'Process', 'Settings', 'Entry', 'RecordValue', 'RecordFilter', 'RecordChange', 'Event', 'Coda', 'ProtocolObject',
    'Contribution', 'ViewInstance']) assert.ok(declared.includes(name), `${name} 没有导出`);
});

test('nothing of a test host is declared or named', () => {
  for (const name of ['TestHost', 'TestPlugin', 'TestCallOptions', 'ProtocolImplementation', 'createTestHost', 'TEST_OWNER'])
    assert.ok(!declared.includes(name) && !source.includes(name), `${name} 不属于协议包`);
  assert.doesNotMatch(source, /test host|plugin-test-host/i);
});

test('the types are exported as ./types and shipped in the package', () => {
  assert.equal(manifest.exports['./types'], './plugin.d.mts');
  assert.ok(manifest.files.includes('plugin.d.mts'));
  assert.equal(fileURLToPath(import.meta.resolve('@coda-console/protocol/types')), fileURLToPath(new URL('../plugin.d.mts', import.meta.url)));
});
