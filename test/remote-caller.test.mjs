import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { newAjv } from '../validate.mjs';

const schema = JSON.parse(readFileSync(new URL('../schemas/protocol/v1/remote-caller.json', import.meta.url)));
const ajv = newAjv();
ajv.addFormat('date-parse', value => Number.isFinite(Date.parse(value)));
const request = ajv.compile(schema);
const check = name => ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` });

test('remote callers bind and discover their record, tools and workflow whitelist', () => {
  for (const name of Object.keys(schema.$defs)) assert.equal(typeof check(name), 'function');
  assert.equal(check('codeResult')({ code: 'once', expiresAt: '2026-11-10T08:00:00Z', addresses: [] }), true);
  assert.equal(check('codeResult')({ code: 'once', expiresAt: 'never', addresses: [] }), false);
  assert.equal(check('bindRequest')({ code: 'once' }), true);
  assert.equal(check('bindResult')({ token: 'secret', record: 'bot-1' }), true);
  assert.equal(check('bindResult')({ token: 'secret', session: 'bot-1' }), false);
  assert.equal(check('helloResponse')({ result: { record: 'bot-1', machine: 'mac-1', tools: ['read_thread'],
    workflows: [{ project: 'project-1', workflow: 'investigate' }] } }), true);
});

test('remote callers can only read tools or file tickets, never choose a caller', () => {
  const ticket = { method: 'file_ticket', params: { workflow: 'investigate', inputs: { key: 'fault-1' }, requestId: 'r1' } };
  for (const value of [{ method: 'hello' }, { method: 'hello', params: {} }, ticket,
    { ...ticket, params: { ...ticket.params, project: 'project-1' } }]) assert.equal(request(value), true);
  for (const name of schema.$defs.helloResult.properties.tools.items.enum)
    assert.equal(request({ method: 'tool', params: { name, arguments: {} } }), true);
  for (const value of [{ method: 'send', params: {} }, { method: 'hello', params: { record: 'other' } },
    { method: 'tool', params: { name: 'new_session', arguments: {} } },
    { method: 'tool', params: { name: 'read_thread' } },
    { ...ticket, parent: { kind: 'threads', id: 'other' } },
    { ...ticket, params: { ...ticket.params, requestId: '' } },
    { ...ticket, params: { ...ticket.params, inputs: [] } }]) assert.equal(request(value), false, JSON.stringify(value));
  for (const reused of [undefined, true]) {
    const result = { run: { kind: 'workflow-runs', id: 'run-1' } };
    if (reused) result.reused = reused;
    assert.equal(check('ticketResponse')({ result }), true);
  }
  assert.equal(check('ticketResponse')({ result: { run: 'run-1' } }), false);
  assert.equal(check('toolResponse')({ result: { content: [{ type: 'text', text: 'ok' }] } }), true);
  assert.equal(check('error')({ error: { code: 'forbidden', message: '流程不在白名单中' } }), true);
  assert.equal(check('error')({ error: { code: 'other', message: '失败' } }), false);
});
