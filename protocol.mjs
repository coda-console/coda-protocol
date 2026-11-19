// Protocol definitions, names and the single invocation envelope. A protocol is a name (`namespace/name@major`), a
// record format (spec/status JSON Schemas) and operations (input plus an immediate result schema or a run reference).
// Nothing here reads a live Coda store or decides who may call what.
import { readFileSync } from 'node:fs';
import { explain, newAjv } from './validate.mjs';

const base = new URL('./schemas/protocol/v1/', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, base), 'utf8'));

export const PROTOCOL_DEFINITION = read('definition.json');
export const INVOCATION_REQUEST = read('request.json');
export const INVOCATION_RESPONSE = read('response.json');
export const RUN_PROTOCOL = read('run.json');
export const AGENT_PROTOCOL = read('agent.json');
export const SESSION_PROTOCOL = read('session.json');
export const ENVIRONMENT_PROTOCOL = read('environment.json');
export const CARD_PROTOCOL = read('card.json');
export const RESOURCE_PROTOCOL = read('resource.json');
export const CORE_PROTOCOLS = Object.freeze(Object.fromEntries(
  [RUN_PROTOCOL, AGENT_PROTOCOL, SESSION_PROTOCOL, ENVIRONMENT_PROTOCOL, CARD_PROTOCOL, RESOURCE_PROTOCOL].map(protocol => [protocol.name, protocol])));

const ajv = newAjv({ ownProperties: true, addUsedSchema: false, strict: false });
const definitionCheck = ajv.compile(PROTOCOL_DEFINITION);
const requestCheck = ajv.compile(INVOCATION_REQUEST);
const responseCheck = ajv.compile(INVOCATION_RESPONSE);
const runStatusCheck = ajv.compile(RUN_PROTOCOL.status);

const NAMESPACE = /^[a-z][a-z0-9-]{0,39}$/, NAME = /^[a-z0-9][a-z0-9-]{0,39}$/, MAJOR = /^[1-9][0-9]*$/;
const SHORT_NAME_MAX = 63;
const NAME_PROBLEM = '须为「命名空间/名字@大版本」：命名空间以小写字母开头，名字以小写字母或数字开头，两者只用小写字母、数字和「-」（各至多 40 个字符），大版本是正整数，短名至多 63 个字符';

function shortName({ namespace, name, major }) {
  return `${namespace.replaceAll('-', '-0')}-1${name.replaceAll('-', '-0')}-2${major}`;
}

export function parseProtocolName(value) {
  if (typeof value !== 'string') return null;
  const slash = value.indexOf('/'), at = value.lastIndexOf('@');
  if (slash <= 0 || at <= slash + 1 || at === value.length - 1) return null;
  const namespace = value.slice(0, slash), name = value.slice(slash + 1, at);
  if (!NAMESPACE.test(namespace) || !NAME.test(name) || !MAJOR.test(value.slice(at + 1))) return null;
  const major = Number(value.slice(at + 1));
  if (!Number.isSafeInteger(major)) return null;
  const parsed = { namespace, name, major };
  return shortName(parsed).length <= SHORT_NAME_MAX ? parsed : null;
}

export function formatProtocolName(parts) {
  if (parts === null || typeof parts !== 'object') return null;
  const { namespace, name, major } = parts;
  if (typeof namespace !== 'string' || !NAMESPACE.test(namespace)) return null;
  if (typeof name !== 'string' || !NAME.test(name)) return null;
  if (!Number.isSafeInteger(major) || major < 1) return null;
  const parsed = { namespace, name, major };
  return shortName(parsed).length <= SHORT_NAME_MAX ? `${namespace}/${name}@${major}` : null;
}

export function protocolNameProblem(value, where = '协议名') {
  return parseProtocolName(value) ? null : `${where}：${NAME_PROBLEM}`;
}

// DNS-safe and reversible: every `-` in the canonical name is written `-0`, `/` is `-1`, `@` is `-2`, and every other
// character stays as it is. Because a literal `-` always starts an escape, the result is injective.
export function protocolShortName(value) {
  const parsed = parseProtocolName(value);
  return parsed ? shortName(parsed) : null;
}

function schemaProblem(schema, where) {
  try {
    ajv.compile(schema);
    return null;
  } catch (error) {
    return `${where}：不是可用的 JSON Schema：${error.message}`;
  }
}

// Permission groups, when written: every group names real operations, streams and events and covers something, every
// operation, stream and event sits in at most one group. One that is in no group is not open to plugins. A group with events
// holds only events: subscribing to the group is subscribing to all of them.
function permissionsProblem({ operations = {}, streams = {}, events = {}, permissions }, where) {
  if (permissions === undefined) return null;
  const owner = { operations: new Map(), streams: new Map(), events: new Map() };
  const things = { operations: ['操作', operations], streams: ['流', streams], events: ['事件', events] };
  for (const [group, entry] of Object.entries(permissions)) {
    for (const key of ['operations', 'streams', 'events']) {
      const [label, defined] = things[key];
      for (const name of entry[key] ?? []) {
        if (!Object.hasOwn(defined, name)) return `${where}.permissions.${group}.${key}：没有${label}「${name}」`;
        if (owner[key].has(name)) return `${where}.permissions.${group}.${key}：${label}「${name}」已经属于权限组「${owner[key].get(name)}」，一个${label}只能属于一组`;
        owner[key].set(name, group);
      }
    }
    if (entry.events !== undefined && ['operations', 'streams', 'read'].some(key => Object.hasOwn(entry, key)))
      return `${where}.permissions.${group}：有 events 的组只放事件，不能再写 operations、streams、read`;
    if (!entry.operations?.length && !entry.streams?.length && !entry.events?.length && entry.read !== true)
      return `${where}.permissions.${group}：至少管一样东西：写 operations、streams 或 events，或 read 为 true`;
  }
  return null;
}

// Events: a protocol outside `coda/` may not use Coda's own event domains, and a payload leaves the top-level `coda` to the host.
const CODA_EVENT_DOMAINS = ['workflow', 'session', 'user'];
function eventsProblem({ events = {} }, namespace, where) {
  for (const [name, { payload }] of Object.entries(events)) {
    if (namespace !== 'coda' && CODA_EVENT_DOMAINS.includes(name.slice(0, name.indexOf('.'))))
      return `${where}.events.${name}：事件名的域不能是 ${CODA_EVENT_DOMAINS.join('、')}，那是 Coda 自己的`;
    if (payload !== null && typeof payload === 'object' && Object.hasOwn(payload.properties ?? {}, 'coda'))
      return `${where}.events.${name}.payload：顶层不能定义 coda，那是留给宿主的`;
  }
  return null;
}

// A definition with no `spec` has no records (a protocol of events only): it is no record kind. Operations, streams and
// reads are addressed by record, so such a protocol has none.
export function protocolHasRecords(definition) {
  return definition.spec !== undefined;
}

function recordsProblem(definition, where) {
  if (protocolHasRecords(definition)) return null;
  const { operations = {}, streams = {}, permissions = {} } = definition;
  const without = '没有记录的协议（没写 spec、status）不能有';
  if (Object.keys(operations).length) return `${where}.operations：${without}操作，要定义操作须同时写 spec 和 status`;
  if (Object.keys(streams).length) return `${where}.streams：${without}流，要定义流须同时写 spec 和 status`;
  const reading = Object.entries(permissions).find(([, group]) => group.read === true);
  return reading ? `${where}.permissions.${reading[0]}.read：${without}读记录的权限，要它须同时写 spec 和 status` : null;
}

// `namespace`: the plugin ID a manifest owns definitions under; omitted for core definitions and standalone checks.
export function definitionProblem(definition, { namespace = null, where = '协议定义' } = {}) {
  if (!definitionCheck(definition))
    return explain(definitionCheck.errors, where, [PROTOCOL_DEFINITION],
      { style: 'description', required: 'property', schemaBase: PROTOCOL_DEFINITION.$id, leadingDot: true });
  const parsed = parseProtocolName(definition.name);
  if (!parsed) return `${where}.name：${NAME_PROBLEM}`;
  if (namespace !== null && parsed.namespace !== namespace)
    return `${where}.name：命名空间须为「${namespace}」，不能在自己的命名空间之外定义协议`;
  const eventing = eventsProblem(definition, parsed.namespace, where);
  if (eventing) return eventing;
  const recording = recordsProblem(definition, where);
  if (recording) return recording;
  const grouping = permissionsProblem(definition, where);
  if (grouping) return grouping;
  const parts = protocolHasRecords(definition) ? [['spec', definition.spec], ['status', definition.status]] : [];
  for (const [operation, value] of Object.entries(definition.operations ?? {})) {
    parts.push([`operations.${operation}.input`, value.input]);
    if (value.result !== undefined) parts.push([`operations.${operation}.result`, value.result]);
  }
  for (const [stream, value] of Object.entries(definition.streams ?? {})) parts.push([`streams.${stream}.input`, value.input]);
  for (const [event, value] of Object.entries(definition.events ?? {})) parts.push([`events.${event}.payload`, value.payload]);
  for (const [key, schema] of parts) {
    const problem = schemaProblem(schema, `${where}.${key}`);
    if (problem) return problem;
  }
  return null;
}

// A plugin owns only its own namespace: check each contributes.protocols definition against its id (or name).
export function ownedProtocolsProblem(manifest) {
  const protocols = manifest?.contributes?.protocols;
  if (protocols === undefined) return null;
  if (!Array.isArray(protocols)) return 'contributes.protocols：须为数组';
  const owner = manifest.id ?? manifest.name;
  if (typeof owner !== 'string') return 'contributes.protocols：插件须有 id 或 name，定义只能放在自己的命名空间下';
  if (owner === 'coda') return 'contributes.protocols：命名空间 coda 保留给核心协议';
  for (const [index, definition] of protocols.entries()) {
    const problem = definitionProblem(definition, { namespace: owner, where: `contributes.protocols[${index}]` });
    if (problem) return problem;
  }
  return null;
}

export const RUN_STATES = Object.freeze(['working', 'input-required', 'completed', 'failed', 'canceled']);
export const RUN_TERMINAL_STATES = Object.freeze(['completed', 'failed', 'canceled']);

function statusProblem(value, where) {
  if (runStatusCheck(value)) return null;
  return explain(runStatusCheck.errors, where, [RUN_PROTOCOL.status],
    { style: 'description', required: 'property', schemaBase: RUN_PROTOCOL.status.$id, leadingDot: true });
}

// Terminal states are final: a status write after one is refused, even one that would write the same state again.
export function runStatusProblem(before, after, where = '运行状态') {
  const problem = statusProblem(before, `${where}（之前）`) ?? statusProblem(after, `${where}（之后）`);
  if (problem) return problem;
  return RUN_TERMINAL_STATES.includes(before.state) ? `${where}：${before.state} 是终态，不能再变` : null;
}

function invocationProblem(check, schema, value, where) {
  if (check(value)) return null;
  return explain(check.errors, where, [schema], { style: 'description', required: 'property', schemaBase: schema.$id, leadingDot: true });
}

export function invocationRequestProblem(value, where = '调用请求') {
  return invocationProblem(requestCheck, INVOCATION_REQUEST, value, where);
}

export function invocationResponseProblem(value, where = '调用回答') {
  return invocationProblem(responseCheck, INVOCATION_RESPONSE, value, where);
}
