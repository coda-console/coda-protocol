// Static public contract only: no scheduler, process, network or ledger simulation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Ajv from 'ajv';
import { EXECUTOR_PROTOCOL, EXECUTION_PROTOCOL } from '@coda-console/protocol/executor';

const read = name => JSON.parse(readFileSync(new URL(`../schemas/executor/v1/${name}.json`, import.meta.url), 'utf8'));
const protocols = [EXECUTOR_PROTOCOL, EXECUTION_PROTOCOL];
const checks = protocols.map(p => Object.fromEntries(['spec', 'status'].map(key => [key, new Ajv().compile(p[key])])));
const [executor, execution] = checks;
const at = '2026-11-01T07:00:00Z';
const resource = (kind = 'runs', id = 'opaque-ref') => ({ kind, id });
const executorSpec = { protocolVersion: 1, enabled: true, capacity: { slots: 2 }, labels: ['build-lab'] };
const executorStatus = {
  detectedLabels: ['darwin', 'arm64', 'gui', 'xcode-26.1', 'ios-26.1', 'node-26'],
  capabilities: { os: 'darwin', arch: 'arm64', nodeVersion: '26.8.2', graphicalSession: null },
  capacity: { slots: 2 }, occupied: { slots: 0 }, available: { slots: 2 }, accepting: true,
  observedAt: at, observedRevision: 'config-version',
  executionFeatures: { multiResource: false, multiUnit: false, exclusive: true },
};
const spec = {
  protocolVersion: 1, run: resource(), attempt: 1, source: null,
  requirements: { labels: [] }, resources: { slots: 1 }, task: { command: 'npm', args: ['test'] }, env: {},
  executor: null, assignmentId: null,
};
const assigned = { ...spec, executor: resource('executor'), assignmentId: 'assignment-1' };
const running = {
  phase: 'running', assignmentId: 'assignment-1', startedAt: at,
  executionRun: resource(), admission: { lease: 'opaque-lease', slots: [0] },
};
const finished = { ...running, phase: 'finished', finishedAt: at, outcome: 'succeeded', exitCode: 0 };
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));
function valid(check, value) { assert.equal(check(value), true, JSON.stringify(check.errors)); }
function invalid(check, value) { assert.equal(check(value), false, JSON.stringify(value)); }

test('definitions are self-contained default-Ajv object schemas and expose only the binding target', () => {
  assert.equal(EXECUTOR_PROTOCOL.kind, 'executor');
  assert.equal(EXECUTION_PROTOCOL.kind, 'execution');
  assert.equal(EXECUTION_PROTOCOL.target, 'executor');
  for (const protocol of protocols) {
    assert.equal(Object.hasOwn(protocol, 'controllers'), false);
    assert.equal(Object.hasOwn(protocol, 'contributions'), false);
    for (const key of ['spec', 'status']) {
      const schema = protocol[key];
      assert.equal(schema.type, 'object');
      const visit = value => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          assert.equal(key.startsWith('x-'), false, key);
          if (key === '$ref') assert.ok(child.startsWith('#/definitions/'), child);
          visit(child);
        }
      };
      visit(schema);
      // Match the Provider compiler, with no external schemas, custom formats or custom keywords.
      new Ajv({ allErrors: true, addUsedSchema: false }).compile(structuredClone(schema));
    }
  }
  assert.equal(Object.hasOwn(EXECUTOR_PROTOCOL, 'target'), false);
});

test('both specs require identity and their core fields; unsupported versions and unknown fields fail', () => {
  for (const [check, value, schema] of [[executor.spec, executorSpec, EXECUTOR_PROTOCOL.spec], [execution.spec, spec, EXECUTION_PROTOCOL.spec]]) {
    valid(check, value);
    for (const key of schema.required) invalid(check, without(value, key));
    for (const version of [0, 2, '1', null]) invalid(check, { ...value, protocolVersion: version });
    invalid(check, { ...value, future: true });
    for (const value of [null, [], false, 'x', 1]) invalid(check, value);
  }
  for (const field of ['run', 'executor']) {
    const base = field === 'run' ? spec : assigned;
    for (const ref of [{}, { id: 'a' }, { kind: 'runs' }, resource('runs', ''), '/tmp/run', { ...base[field], machine: 'host' }])
      invalid(execution.spec, { ...base, [field]: ref });
  }
});

test('requests are unmetered or one unit of one resource; capacity is a map, not permission for resource vectors', () => {
  for (const exclusiveResources of [[], ['slots']]) valid(execution.spec, { ...spec, exclusiveResources });
  for (const resources of [{}, { 'group:device/iphone': 1 }, { 'group:构建': 1 }]) valid(execution.spec, { ...spec, resources });
  valid(execution.spec, { ...spec, resources: { 'group:device': 1 }, exclusiveResources: ['group:device'] });
  invalid(execution.spec, { ...spec, resources: {}, exclusiveResources: ['slots'] });
  for (const resources of [{ slots: 0 }, { slots: 2 }, { slots: -1 }, { slots: 0.5 }, { slots: '1' }, { cpu: 1 }, { slots: 1, 'group:device': 1 }])
    invalid(execution.spec, { ...spec, resources });
  for (const key of ['', 'gpu', 'group:', 'group:host', 'group:two words', 'group:x\n', 'group:x\0', `group:${'a'.repeat(101)}`]) {
    invalid(execution.spec, { ...spec, resources: { [key]: 1 } });
    invalid(execution.spec, { ...spec, exclusiveResources: [key] });
    invalid(executor.spec, { ...executorSpec, capacity: { [key]: 1 } });
  }
  for (const exclusiveResources of [['gpu'], ['slots', 'slots'], ['slots', 'gpu'], 'slots', null]) invalid(execution.spec, { ...spec, exclusiveResources });
  for (const slots of [0, 1, 8]) valid(executor.spec, { ...executorSpec, capacity: { slots } });
  for (const capacity of [{}, { slots: 2, 'group:device': 1 }]) valid(executor.spec, { ...executorSpec, capacity });
  for (const capacity of [{ slots: -1 }, { slots: 1.5 }, { slots: Infinity }, { slots: 1, gpu: 0 }]) invalid(executor.spec, { ...executorSpec, capacity });
  for (const key of ['multiResource', 'multiUnit']) invalid(executor.status, { ...executorStatus, executionFeatures: { ...executorStatus.executionFeatures, [key]: true } });
  valid(executor.status, { ...executorStatus, executionFeatures: { multiResource: false, multiUnit: false, exclusive: false } });
  for (const key of ['noResources', 'namedResources', 'context']) {
    valid(executor.status, { ...executorStatus, executionFeatures: { ...executorStatus.executionFeatures, [key]: true } });
    invalid(executor.status, { ...executorStatus, executionFeatures: { ...executorStatus.executionFeatures, [key]: 'true' } });
  }
  // Capacity shrink and exclusivity are ledger facts, not an incorrect occupied <= capacity schema rule.
  valid(executor.status, { ...executorStatus, capacity: { slots: 0 }, occupied: { slots: 2 }, available: { slots: 0 }, accepting: false });
});

test('placement constrains scheduling without creating a binding or accepting topology parameters', () => {
  for (const placement of [{}, { locality: 'local' }, { locality: 'any' }, { executor: resource('executor') },
    { locality: 'local', executor: resource('executor') }]) valid(execution.spec, { ...spec, placement });
  for (const placement of [null, [], { locality: 'fallback' }, { locality: '' }, { machine: 'macmini' }, { executor: null },
    { executor: resource('runs') }, { executor: [resource('executor')] }, { executor: { ...resource('executor'), machine: 'macmini' } }])
    invalid(execution.spec, { ...spec, placement });
  const input = { ...structuredClone(spec), placement: { locality: 'local' } };
  const defaults = new Ajv({ useDefaults: true }).compile(EXECUTION_PROTOCOL.spec);
  valid(defaults, input);
  assert.equal(input.executor, null);
  assert.equal(input.assignmentId, null);
  assert.deepEqual(input.placement, { locality: 'local' });
});

test('workflow context is bounded provenance and output declarations, never paths, credentials or arbitrary launch environment', () => {
  const workflow = { name: 'check', job: 'build', runId: 'run-id', runAttempt: 1, sha: 'a'.repeat(40), ref: 'refs/heads/main', repository: 'owner/repo' };
  const context = { workflow, plugin: { id: 'host', version: '1.2.2' }, audience: 'user', outputNames: ['answer'] };
  for (const patch of [{}, context, { workflow: { ...workflow, sha: '', ref: '', repository: '' } }, { outputNames: [] }])
    valid(execution.spec, { ...spec, context: patch });
  for (const key of Object.keys(workflow)) invalid(execution.spec, { ...spec, context: { workflow: without(workflow, key) } });
  for (const patch of [{ env: { SECRET: 'value' } }, { plugin: { ...context.plugin, path: '/tmp/plugin' } },
    { plugin: { id: 'host' } }, { workflow: { ...workflow, sha: 'HEAD' } }, { workflow: { ...workflow, runAttempt: 0 } },
    { outputNames: ['answer', 'answer'] }, { outputNames: Array.from({ length: 65 }, (_, i) => `key${i}`) },
    { outputNames: [''] }, { audience: 'agent' }]) invalid(execution.spec, { ...spec, context: patch });
});

test('user labels cannot impersonate detection; requirements and detected labels retain runsOn syntax', () => {
  for (const labels of [['build-lab'], []]) valid(executor.spec, { ...executorSpec, labels });
  for (const label of ['darwin', 'arm64', 'x64', 'gui', 'xcode-26.1', 'ios-26.1', 'node-26']) {
    invalid(executor.spec, { ...executorSpec, labels: [label] });
    valid(execution.spec, { ...spec, requirements: { labels: [label] } });
  }
  for (const labels of [['Uppercase'], ['label\n'], ['two words'], [' padded '], ['a', 'a'], ['x'.repeat(41)], [''], Array.from({ length: 65 }, (_, i) => `label-${i}`)]) {
    invalid(executor.spec, { ...executorSpec, labels });
    invalid(execution.spec, { ...spec, requirements: { labels } });
    invalid(executor.status, { ...executorStatus, detectedLabels: labels });
  }
});

test('status may be unknown but never a partial snapshot or invented default', () => {
  for (const protocol of protocols) {
    const check = new Ajv({ useDefaults: true }).compile(protocol.status);
    const unknown = {};
    valid(check, unknown);
    assert.deepEqual(unknown, {});
    for (const value of [null, [], { reason: { code: 'offline', message: 'Unknown' } }, { future: true }]) invalid(check, value);
  }
  valid(executor.status, executorStatus);
  for (const key of Object.keys(executorStatus)) invalid(executor.status, without(executorStatus, key));
  const capabilities = { ...executorStatus.capabilities, graphicalSession: true, xcode: { version: '26.1', build: '17B55' }, simulatorRuntimes: [{ id: 'runtime-id', version: '26.1', available: false }] };
  valid(executor.status, { ...executorStatus, capabilities, reason: { code: 'probe-unavailable', message: 'Simulator probe unavailable' } });
  invalid(executor.status, { ...executorStatus, capabilities: { ...capabilities, graphicalSession: 'unknown' } });
  for (const key of ['capacity', 'occupied', 'available']) invalid(executor.status, { ...executorStatus, [key]: { slots: 1, gpu: 0 } });
});

test('source and task branches are exclusive and reject wrong kinds or abbreviated commits', () => {
  for (const source of [null, { snapshot: resource('sourceSnapshot') }, ...[40, 64].map(n => ({ repository: resource('gitSource'), commit: 'a'.repeat(n) }))]) valid(execution.spec, { ...spec, source });
  for (const source of [{}, { snapshot: resource('gitSource') }, { repository: resource('sourceSnapshot'), commit: 'a'.repeat(40) },
    { repository: resource('gitSource'), commit: 'HEAD' }, { repository: resource('gitSource'), commit: 'a'.repeat(39) },
    { repository: resource('gitSource'), commit: 'g'.repeat(40) }, { repository: resource('gitSource'), commit: 'a'.repeat(40) + '\n' }, { snapshot: resource('sourceSnapshot'), repository: resource('gitSource'), commit: 'a'.repeat(40) }]) invalid(execution.spec, { ...spec, source });
  for (const task of [{ script: 'npm test', shell: 'sh' }, { command: 'npm', args: [] }, { command: 'printf', args: ['', '$HOME'] }]) valid(execution.spec, { ...spec, task });
  for (const task of [{}, { script: 'npm test' }, { command: 'npm' }, { command: '', args: [] }, { command: 'npm', args: 'test' },
    { script: 'npm test', shell: 'sh', command: 'npm', args: [] }]) invalid(execution.spec, { ...spec, task });
});

test('binding is an atomic nullable pair with an executor-kind reference, never an array', () => {
  valid(execution.spec, assigned);
  for (const patch of [{ executor: resource('executor') }, { assignmentId: 'assignment-1' }, { executor: [] },
    { executor: [resource('executor')], assignmentId: 'assignment-1' }, { executor: resource('host'), assignmentId: 'assignment-1' }])
    invalid(execution.spec, { ...spec, ...patch });
  for (const assignmentId of ['', null, 1, []]) invalid(execution.spec, { ...assigned, assignmentId });
});

test('working directories are lexically relative; declaration defaults are applied only when requested', () => {
  for (const workingDirectory of ['.', 'src', './src', 'src/lib', 'a..b', '源码']) valid(execution.spec, { ...spec, workingDirectory });
  for (const workingDirectory of ['', '/tmp', '../src', 'src/../out', '..', './..', 'src/..', 'C:/src', 'C:src', '\\server\\share', 'src\\..\\out', 'src\nfile', 'src\0file'])
    invalid(execution.spec, { ...spec, workingDirectory });
  const unchanged = structuredClone(spec);
  valid(execution.spec, unchanged);
  assert.deepEqual(unchanged, spec);
  const defaults = new Ajv({ useDefaults: true }).compile(EXECUTION_PROTOCOL.spec);
  const filled = structuredClone(spec);
  valid(defaults, filled);
  assert.deepEqual(filled, { ...spec, cancel: false, exclusiveResources: [], workingDirectory: '.' });
});

test('phase and outcome combinations reject incomplete running and terminal facts', () => {
  for (const status of [{ phase: 'queued', assignmentId: null }, { phase: 'queued', assignmentId: 'assignment-1' },
    { phase: 'preparing', assignmentId: 'assignment-1' }, running, finished,
    { phase: 'finished', assignmentId: null, finishedAt: at, outcome: 'cancelled', exitCode: null },
    { phase: 'finished', assignmentId: 'assignment-1', finishedAt: at, outcome: 'rejected', reason: { code: 'capacity', message: 'No admission; will not start' } }]) valid(execution.status, status);
  for (const key of ['assignmentId', 'startedAt', 'executionRun', 'admission']) invalid(execution.status, without(running, key));
  for (const key of ['phase', 'assignmentId', 'finishedAt', 'outcome', 'startedAt']) invalid(execution.status, without(finished, key));
  for (const status of [{ phase: 'queued' }, { phase: 'preparing', assignmentId: null }, { ...running, assignmentId: null },
    { ...running, outcome: 'succeeded' }, { ...running, exitCode: 0 }, { ...running, finishedAt: at },
    { ...finished, outcome: 'unknown' }, { ...finished, outcome: 'rejected' }, { ...finished, assignmentId: null },
    { ...without(finished, 'startedAt'), outcome: 'rejected', exitCode: 0 },
    { ...running, admission: { lease: 'lease', slots: [0, 0] } }, { ...running, admission: { lease: 'lease', slots: [-1] } }]) invalid(execution.status, status);
  valid(execution.status, { ...running, admission: { lease: 'lease', slots: [0, 1] } });
  // Separate spec/status schemas cannot compare the request: the executor must enforce null iff resources is empty.
  valid(execution.status, { ...running, admission: null });
  valid(execution.status, { ...running, admission: { resource: 'group:device', lease: 'lease', slots: [0] } });
  for (const admission of [{}, { resource: 'group:device', lease: 'lease', slots: [] }, { resource: 'gpu', lease: 'lease', slots: [0] }])
    invalid(execution.status, { ...running, admission });
});

test('outputs and references have finite static limits without custom byte or path validators', () => {
  const outputs = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`key${i}`, '😀'.repeat(4096)]));
  valid(execution.status, { ...finished, outputs, summary: '😀'.repeat(4096), outputTail: 'x'.repeat(16384) });
  for (const patch of [{ outputs: { ...outputs, extra: '' } }, { outputs: { x: 'x'.repeat(4097) } }, { summary: 'x'.repeat(4097) },
    { outputTail: 'x'.repeat(16385) }, { outputs: { x: 1 } }, { logs: Array(65).fill({ ref: resource('logs') }) },
    { artifacts: [{ ref: '/tmp/file', name: 'out' }] }, { logs: [{ ref: resource('logs'), path: '/tmp/log' }] }]) invalid(execution.status, { ...finished, ...patch });
  const artifact = { ref: resource('artifacts'), name: 'out.tar', sha256: 'a'.repeat(64), size: 0, mediaType: 'application/x-tar' };
  valid(execution.status, { ...finished, artifacts: [artifact], logs: [{ ref: resource('logs'), cursor: 'opaque' }] });
  for (const patch of [{ sha256: 'bad' }, { size: -1 }, { size: 0.5 }, { size: Infinity }, { ref: { ...resource('artifacts'), machine: 'mac' } }]) invalid(execution.status, { ...finished, artifacts: [{ ...artifact, ...patch }] });
  for (const patch of [{ env: { 'KEY\n': 'x' } }, { env: { 'BAD=NAME': 'x' } }, { env: { KEY: null } }, { timeoutMs: 0 }, { cancelGraceMs: -1 }, { attempt: 0 }, { cancel: 'true' }]) invalid(execution.spec, { ...spec, ...patch });
  for (const observedAt of [at + '\n', 'yesterday', '2026-13-01T00:00:00Z', '2026-11-01T25:00:00Z', '2026-11-01', 0]) invalid(executor.status, { ...executorStatus, observedAt });
});

test('raw JSON schemas and exported parts agree on the documented wire examples', () => {
  const doc = readFileSync(new URL('../docs/executor-protocol.md', import.meta.url), 'utf8');
  const examples = [...doc.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
  assert.equal(examples.length, 2);
  for (const [i, protocol] of protocols.entries()) {
    const ajv = new Ajv();
    ajv.addSchema(read('common'));
    const raw = ajv.compile(read(protocol.kind));
    valid(raw, examples[i]);
    const extended = structuredClone(examples[i]);
    if (protocol.kind === 'executor') {
      extended.spec.capacity['group:device'] = 1;
      extended.status.executionFeatures.noResources = true;
      extended.status.executionFeatures.namedResources = true;
    } else {
      extended.spec.resources = {};
      extended.spec.exclusiveResources = [];
      extended.spec.placement = { locality: 'local' };
      extended.spec.context = { outputNames: [] };
      extended.status.admission = null;
    }
    valid(raw, extended);
    for (const part of ['spec', 'status']) {
      valid(checks[i][part], examples[i][part]);
      valid(checks[i][part], extended[part]);
      const invalidExample = structuredClone(examples[i]);
      invalidExample[part].unknown = true;
      invalid(raw, invalidExample);
      invalid(checks[i][part], invalidExample[part]);
    }
  }
});
