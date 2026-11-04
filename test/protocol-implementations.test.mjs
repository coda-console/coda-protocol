import test from 'node:test';
import assert from 'node:assert/strict';
import { manifestProblem } from '../validate.mjs';

const problem = declarations => manifestProblem({ contributes: { protocolImplementations: declarations } });
test('protocol implementations declare a type and major version, optionally one local object', () => {
  for (const declaration of [{ kind: 'executor', version: 1, id: 'host' }, { kind: 'execution', version: 1 },
    { kind: 'documents', version: 3 }, { kind: 'anotherType', version: 2, id: 'document/one' }])
    assert.equal(problem([declaration]), null);
  assert.equal(problem([]), null);
  assert.equal(manifestProblem({ name: 'unchanged' }), null);
});
test('invalid implementation declarations fail at the manifest boundary', () => {
  for (const declaration of [{}, { kind: 'executor' }, { version: 1 }, { kind: 'Executor', version: 1 },
    { kind: 'executor', version: 0 }, { kind: 'executor', version: 1.5 }, { kind: 'executor', version: '1' },
    { kind: 'executor', version: 1, id: '' }, { kind: 'executor', version: 1, id: 'remote:other' },
    { kind: 'executor', version: 1, id: null }, { kind: 'executor', version: 1, command: 'run' }])
    assert.match(problem([declaration]), /protocolImplementations/);
  assert.match(problem([{ kind: 'executor', version: 1 }, { kind: 'executor', version: 1 }]), /protocolImplementations/);
  assert.match(problem({ kind: 'executor', version: 1 }), /protocolImplementations/);
});
