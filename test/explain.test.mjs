// Shared diagnostics preserve each caller's wording while resolving schema descriptions safely.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { described, explain, newAjv, schemaAt } from '../validate.mjs';
import { agentMessageProblem } from '../agent.mjs';

const options = { style: 'description', required: 'property', schemaBase: 'https://example.test/root.json', leadingDot: true };
const missing = (properties, key = 'value') => ({
  keyword: 'required', instancePath: '', schemaPath: '#/required', message: 'required fallback',
  params: { missingProperty: key }, parentSchema: { description: 'parent fallback', properties },
});

test('newAjv applies ownProperties at construction and retains shared keywords', () => {
  const schema = { type: 'object', required: ['value'], properties: { value: { type: 'array', 'x-unique-by': ['id'] } } };
  const own = newAjv({ ownProperties: true }).compile(schema), defaults = newAjv().compile(schema);
  const inherited = Object.create({ value: [] });
  assert.equal(defaults(inherited), true);
  assert.equal(own(inherited), false);
  assert.equal(own.errors[0].keyword, 'required');
  assert.equal(own({ value: [{ id: 'a' }, { id: 'a' }] }), false);
  assert.equal(own.errors[0].keyword, 'x-unique-by');
});

test('missing properties follow references and ordered allOf descriptions with escaped paths', () => {
  const schemas = [
    { $id: 'https://example.test/nested/first.json', $defs: { value: { $ref: 'second.json#/$defs/value' } } },
    { $id: 'https://example.test/nested/second.json', $defs: { value: { allOf: [{}, { description: 'field description' }, { description: 'later' }] } } },
  ];
  const error = missing({ 'a/b~c': { $ref: 'nested/first.json#/$defs/value' } }, 'a/b~c');
  assert.equal(explain([error], 'root', schemas, options), 'root「a/b~c」：field description');
  assert.equal(explain([error], 'root', schemas), 'root 缺 a/b~c：parent fallback');
  assert.equal(described(error, { schemas }), 'parent fallback');
  assert.equal(described(error, { schemas, required: 'property', schemaBase: options.schemaBase }), 'field description');
});

test('description style keeps keyword wording, empty bases and missing-property fallbacks', () => {
  const error = missing({ value: {} });
  assert.equal(explain([error], '', [], options), '.value：parent fallback');
  assert.equal(explain([error]), 'package.json 缺 value：parent fallback');
  delete error.parentSchema.description;
  assert.equal(explain([error], 'root', [], options), 'root.value：required fallback');
  assert.equal(agentMessageProblem('_coda/wait', {}, ''), '.sessionId：缺 sessionId');
  assert.equal(agentMessageProblem('_coda/wait', null, ''), '：params 须为对象');
  const type = { keyword: 'type', instancePath: '/0/a~1b', params: { type: 'string' }, parentSchema: { description: 'schema wording' } };
  assert.equal(explain([type], 'root'), 'root[0]「a/b」 须为文本：schema wording');
  assert.equal(explain([type], 'root', [], options), 'root[0]「a/b」：schema wording');
});

test('schema pointers and missing-property lookup use only own keys', () => {
  const schema = { properties: JSON.parse('{"__proto__":{"description":"own description"},"a/b~c":false}') };
  const schemas = { 'own.json': schema };
  assert.equal(schemaAt('own.json#/properties/__proto__', schemas).description, 'own description');
  assert.equal(schemaAt('own.json#/properties/a~1b~0c', schemas), false);
  for (const ref of ['constructor', '__proto__', 'own.json#/properties/toString', 'own.json#/properties/constructor',
    'own.json#/%', 'own.json#/properties/~2', 'own.json#anchor', 'own.json##']) assert.equal(schemaAt(ref, schemas), undefined);
  assert.equal(explain([missing(schema.properties, '__proto__')], 'root', [], options), 'root.__proto__：own description');
  assert.equal(explain([missing(Object.create({ value: { description: 'inherited' } }))], 'root', [], options), 'root.value：parent fallback');
});

test('description lookup handles reference cycles, deep allOf and wide branches without recursion or spread', () => {
  const cyclic = { $id: options.schemaBase, $defs: { loop: { $ref: '#/$defs/loop' } } };
  const branch = { allOf: [{ $ref: '#/$defs/loop' }, { description: 'after cycle' }] };
  assert.equal(explain([missing({ value: branch })], 'root', [cyclic], options), 'root.value：after cycle');
  let deep = { description: 'deep description' };
  for (let i = 0; i < 20000; i++) deep = { allOf: [deep] };
  assert.equal(explain([missing({ value: deep })], 'root', [], options), 'root.value：deep description');
  const wide = Array(200000).fill({});
  wide.push({ description: 'wide description' });
  assert.equal(explain([missing({ value: { allOf: wide } })], 'root', [], options), 'root.value：wide description');
});
