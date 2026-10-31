// Coda's extensions beside ACP: methods select schemas from a table; metadata selects a schema by reference.
// ACP itself stays with its SDK. These checks neither normalize values nor decide anything about a live session.
import { readFileSync, readdirSync } from 'node:fs';
import { newAjv, described } from './validate.mjs';
import { jsonFits, valueKeywords } from './workflow/keywords.mjs';

const dir = new URL('./schemas/agent/', import.meta.url), base = 'https://coda.pub/schemas/agent/v1/';
const read = file => JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
export const AGENT_METHODS = read('messages.json').methods;
export const AGENT_SCHEMAS = Object.fromEntries(readdirSync(dir).filter(file => file.endsWith('.json') && file !== 'messages.json')
  .sort().map(file => [file, read(file)]));
const schemas = Object.values(AGENT_SCHEMAS), ajv = newAjv();
// Wire objects have own keys, including names also found on Object.prototype.
ajv.opts.ownProperties = true;
valueKeywords(ajv, {});
ajv.addFormat('date-parse', value => Number.isFinite(Date.parse(value)));
for (const schema of schemas) ajv.addSchema(schema);

const unescape = step => step.replaceAll('~1', '/').replaceAll('~0', '~');
const escape = step => step.replaceAll('~', '~0').replaceAll('/', '~1');
const place = (path, where) => path.split('/').slice(1).map(unescape).reduce((at, step) =>
  /^\d+$/.test(step) ? `${at}[${step}]` : /^[A-Za-z_$][\w$]*$/.test(step) ? `${at}.${step}` : `${at}「${step}」`, where);
function schemaAt(ref) {
  if (typeof ref !== 'string') return undefined;
  const [file, fragment = '', extra] = ref.split('#');
  if (extra !== undefined || !Object.hasOwn(AGENT_SCHEMAS, file)) return undefined;
  let pointer;
  try { pointer = decodeURIComponent(fragment); } catch { return undefined; }
  if (pointer && !pointer.startsWith('/')) return undefined;
  let node = AGENT_SCHEMAS[file];
  for (const token of pointer.split('/').slice(1)) {
    if (/~(?:[^01]|$)/.test(token)) return undefined;
    const key = unescape(token);
    node = node && typeof node === 'object' && Object.hasOwn(node, key) ? node[key] : undefined;
  }
  return typeof node === 'boolean' || node && typeof node === 'object' && !Array.isArray(node) ? node : undefined;
}
// Resolve only schema references, never pointers through incoming data or prototype properties.
function resolve(schema) {
  while (schema?.$ref) {
    const url = new URL(schema.$ref, base), file = url.pathname.split('/').at(-1);
    schema = schemaAt(`${file}${url.hash}`);
  }
  return schema;
}
function description(schema) {
  const stack = [schema];
  while (stack.length) {
    const node = resolve(stack.pop());
    if (node?.description) return node.description;
    if (node?.allOf) for (let i = node.allOf.length - 1; i >= 0; i--) stack.push(node.allOf[i]);
  }
}
function problem(error, where) {
  let path = error.instancePath, said;
  if (error.keyword === 'required') {
    const key = error.params.missingProperty, properties = error.parentSchema.properties;
    path += `/${escape(key)}`;
    said = properties && Object.hasOwn(properties, key) ? description(properties[key]) : undefined;
  }
  return `${place(path, where)}：${said ?? described(error, { schemas }) ?? error.message}`;
}

// A reference is relative to schemas/agent/, optionally with a JSON Pointer fragment.
export function agentValueProblem(ref, value, where = ref) {
  const validate = schemaAt(ref) !== undefined ? ajv.getSchema(`${base}${ref}`) : null;
  if (!validate) return `${where}：没有这个 Agent schema`;
  if (!validate(value)) return problem(validate.errors[0], where);
  // Opaque remote payloads and future metadata are JSON too. An explicit stack handles deep/wide values and cycles.
  return jsonFits(value, Infinity) ? null : `${where}：${AGENT_SCHEMAS['json.json'].description}`;
}
function messageProblem(method, part, value, where) {
  const entry = typeof method === 'string' && Object.hasOwn(AGENT_METHODS, method) ? AGENT_METHODS[method] : null;
  if (!entry) return `${where}：没有这个 Coda 扩展方法`;
  if (!Object.hasOwn(entry, part)) return `${where}：通知没有答复`;
  return agentValueProblem(entry[part], value, where);
}
export const agentMessageProblem = (method, params, where = `${method} params`) => messageProblem(method, 'params', params, where);
export const agentResultProblem = (method, result, where = `${method} result`) => messageProblem(method, 'result', result, where);
// Pass the capabilities' _meta object, not initialize itself. An absent _meta means no Coda capabilities declared.
export function agentCapabilitiesProblem(meta, party = 'agent', where = `${party}Capabilities._meta`) {
  if (party !== 'agent' && party !== 'client') return `${where}：能力声明方只能是 agent 或 client`;
  return meta === undefined ? null : agentValueProblem(`${party}-capabilities.json`, meta, where);
}
