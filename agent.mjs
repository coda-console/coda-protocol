// Coda's extensions beside ACP: methods select schemas from a table; metadata selects a schema by reference.
// ACP itself stays with its SDK. These checks neither normalize values nor decide anything about a live session.
import { readFileSync, readdirSync } from 'node:fs';
import { newAjv, explain, schemaAt } from './validate.mjs';
import { jsonFits, valueKeywords } from './workflow/keywords.mjs';

const dir = new URL('./schemas/agent/', import.meta.url), base = 'https://coda.pub/schemas/agent/v1/';
const read = file => JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
export const AGENT_METHODS = read('messages.json').methods;
export const AGENT_SCHEMAS = Object.fromEntries(readdirSync(dir).filter(file => file.endsWith('.json') && file !== 'messages.json')
  .sort().map(file => [file, read(file)]));
// Wire objects have own keys, including names also found on Object.prototype.
const schemas = Object.values(AGENT_SCHEMAS), ajv = newAjv({ ownProperties: true });
valueKeywords(ajv, {});
ajv.addFormat('date-parse', value => Number.isFinite(Date.parse(value)));
// RFC 3339 date-time, strict: a real calendar day and a zone, unlike the lenient `date-parse`.
ajv.addFormat('date-time', value => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})[Tt]([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (parts === null) return false;
  const day = new Date(Date.UTC(+parts[1], +parts[2] - 1, +parts[3]));
  return day.getUTCMonth() === +parts[2] - 1 && day.getUTCDate() === +parts[3];
});
// Entries of one model are merged by adding the four core counts; each sum must stay a safe integer.
const CORE_COUNTS = ['inputTokens', 'outputTokens', 'cachedReadTokens', 'cachedWriteTokens'];
ajv.addKeyword({
  keyword: 'x-sum-max', type: 'array', schemaType: 'number', errors: true,
  compile(limit, parentSchema) {
    return function sum(entries) {
      const totals = new Map();
      for (const entry of entries) {
        if (typeof entry?.model !== 'string') continue;
        const counts = totals.get(entry.model) ?? totals.set(entry.model, {}).get(entry.model);
        for (const name of CORE_COUNTS) {
          const count = entry[name];
          if (!Number.isInteger(count)) continue;
          counts[name] = (counts[name] ?? 0) + count;
          if (counts[name] > limit) { sum.errors = [{ keyword: 'x-sum-max', params: { limit }, parentSchema, message: '合计过大' }]; return false; }
        }
      }
      return true;
    };
  },
});
for (const schema of schemas) ajv.addSchema(schema);

// A reference is relative to schemas/agent/, optionally with a JSON Pointer fragment.
export function agentValueProblem(ref, value, where = ref) {
  const validate = schemaAt(ref, AGENT_SCHEMAS) !== undefined ? ajv.getSchema(`${base}${ref}`) : null;
  if (!validate) return `${where}：没有这个 Agent schema`;
  if (!validate(value)) return explain(validate.errors, where, schemas, { style: 'description', required: 'property', schemaBase: base, leadingDot: true });
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
