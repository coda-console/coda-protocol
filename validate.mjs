// A plugin is right when what it writes is of the types it names: each key of a manifest's `contributes` is a type with a
// JSON Schema of its own (schemas/plugin/, `https://coda.pub/schemas/plugin/v1/…`), and a key that is no type of Coda's is
// one a plugin's extension point declares, for that plugin to read: of the schema that point names, a file of the declaring
// plugin's (`extensionPoints.<point>.schema`), when it names one. Checking one is checking it against those schemas,
// nothing else: a field joins a type by joining its schema, never by a rule here. Coda checks a plugin with this module
// when it reads one, and coda-plugins' contract check does where a plugin is written.
// What JSON Schema cannot say of one value alone it says with five keywords, each meaning one thing wherever it is written,
// as Kubernetes extends its OpenAPI with `x-kubernetes-*`:
// - `x-unique-by`: [name or { part }] — in an array, each named property of its objects is unique among the items having it,
//   and so is `part`'s first group of each of its texts (a directory's last name);
// - `x-max-contains`: { match, max } — of an object's values, at most `max` satisfy `match` (`maxContains` of an object);
// - `x-ref`: { pointer, part?, match? } — the value (or `part`'s first group of it) names a key of the object, or an element
//   of the array, at `pointer` in the manifest: absolute (`/contributes/configuration/properties`), or relative to the value
//   (`2/properties`: two levels up, then down); what it names satisfies `match` when that is given;
// - `x-placeholders`: { names?, config? } — every `${…}` in the text is one of `names`, or `config:<setting>` naming one of
//   the plugin's settings that satisfies `config`;
// - `x-file`: { type, under?, suffix?, contains?, maxBytes?, magic?, schema?, absent? } — the value is a path in the plugin's
//   directory (with `under` before it and `suffix` after it) that never leaves it, of that type, holding `contains`, at most
//   `maxBytes` long, starting with `magic`, with `schema` a JSON Schema these keywords compile; with `absent`, a path there
//   is none at. Checked when the directory is known.
// It imports nothing but Node and Ajv.
import { createHash } from 'node:crypto';
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

export const SCHEMA_DIR = fileURLToPath(new URL('./schemas/plugin/', import.meta.url));
const BASE = 'https://coda.pub/schemas/plugin/v1/';
// The schemas, by file name.
export const SCHEMAS = Object.fromEntries(readdirSync(SCHEMA_DIR).filter(file => file.endsWith('.json')).sort()
  .map(file => [file, JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'))]));
// The types a plugin may contribute to Coda itself, as the manifest's schema names them.
export const TYPES = Object.keys(SCHEMAS['plugin.json'].properties.contributes.properties);

// What a pointer names, from where a keyword is: the manifest's root, or levels up from the value itself.
function locate(pointer, { rootData, instancePath }) {
  const relative = /^(\d+)(.*)$/.exec(pointer);
  const up = relative ? Number(relative[1]) : 0, rest = relative ? relative[2] : pointer;
  const here = instancePath.split('/').slice(1).map(unescape);
  if (up > here.length) return undefined;
  const steps = [...(relative ? here.slice(0, here.length - up) : []), ...rest.split('/').slice(1).map(unescape)];
  return steps.reduce((at, step) => at !== null && typeof at === 'object' && Object.hasOwn(at, step) ? at[step] : undefined, rootData);
}
const unescape = step => step.replace(/~1/g, '/').replace(/~0/g, '~');
const fail = (validate, keyword, message, parentSchema) => { validate.errors = [{ keyword, message, params: {}, parentSchema }]; return false; };

// What each keyword is written with, checked where a schema using it is compiled: one written wrong is refused there, as an
// extension point's schema is (x-file `schema`), not where a value is checked against it.
const SCHEMA_VALUE = { type: ['object', 'boolean'] };
const META = {
  'x-max-contains': { type: 'object', properties: { match: SCHEMA_VALUE, max: { type: 'integer', minimum: 0 } }, required: ['match', 'max'], additionalProperties: false },
  'x-unique-by': { type: 'array', minItems: 1, items: { anyOf: [{ type: 'string' },
    { type: 'object', properties: { part: { type: 'string' } }, required: ['part'], additionalProperties: false }] } },
  'x-ref': { type: 'object', properties: { pointer: { type: 'string', pattern: '^(?:\\d+(?:/.*)?|/.*)$' }, part: { type: 'string' }, match: SCHEMA_VALUE },
    required: ['pointer'], additionalProperties: false },
  'x-placeholders': { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } }, config: SCHEMA_VALUE }, additionalProperties: false },
  'x-file': { type: 'object', properties: { type: { enum: ['file', 'directory'] }, under: { type: 'string' }, suffix: { type: 'string' }, contains: { type: 'string' },
    maxBytes: { type: 'integer', minimum: 0 }, magic: { type: 'string' }, schema: { type: 'boolean' }, absent: { type: 'boolean' } },
    required: ['type'], additionalProperties: false },
};

function keywords(ajv) {
  ajv.addKeyword({
    keyword: 'x-max-contains', type: 'object', schemaType: 'object', metaSchema: META['x-max-contains'],
    compile({ match, max }) {
      const matcher = ajv.compile(match);
      return value => Object.values(value).filter(each => matcher(each)).length <= max;
    },
  });
  ajv.addKeyword({
    keyword: 'x-unique-by', type: 'array', schemaType: 'array', metaSchema: META['x-unique-by'], errors: true,
    compile(keys, parentSchema) {
      const by = keys.map(key => typeof key === 'object' ? { part: new RegExp(key.part, 'u') } : { key });
      return function unique(items) {
        for (const { key, part } of by) {
          const seen = new Set();
          for (const item of items) {
            const value = part ? (typeof item === 'string' ? part.exec(item)?.[1] : undefined)
              : item && typeof item === 'object' && Object.hasOwn(item, key) ? item[key] : undefined;
            if (value === undefined) continue;
            const said = JSON.stringify(value);
            if (seen.has(said)) return fail(unique, 'x-unique-by', part ? `不能重复：${value}` : `${key} 不能重复：${value}`, parentSchema);
            seen.add(said);
          }
        }
        return true;
      };
    },
  });
  // A reference: whether `name` is a key (or element) of what `pointer` names, and that satisfies `match`.
  const resolves = (ref, matcher, name, cxt) => {
    const at = locate(ref.pointer, cxt);
    if (Array.isArray(at)) return at.includes(name);
    if (!at || typeof at !== 'object' || !Object.hasOwn(at, name)) return false;
    return !matcher || matcher(at[name]);
  };
  ajv.addKeyword({
    keyword: 'x-ref', type: 'string', schemaType: 'object', metaSchema: META['x-ref'],
    compile(ref) {
      const matcher = ref.match ? ajv.compile(ref.match) : null, part = ref.part ? new RegExp(ref.part, 'u') : null;
      return (value, cxt) => {
        const name = part ? part.exec(value)?.[1] : value;
        return name !== undefined && resolves(ref, matcher, name, cxt);
      };
    },
  });
  ajv.addKeyword({
    keyword: 'x-placeholders', type: 'string', schemaType: 'object', metaSchema: META['x-placeholders'],
    compile(allowed) {
      const config = allowed.config ? { pointer: '/contributes/configuration/properties' } : null, matcher = allowed.config ? ajv.compile(allowed.config) : null;
      return (value, cxt) => [...value.matchAll(/\$\{([^}]*)\}/g)].every(([, place]) => {
        if ((allowed.names ?? []).includes(place)) return true;
        const setting = /^config:(.+)$/.exec(place)?.[1];
        return !!(config && setting && resolves(config, matcher, setting, cxt));
      });
    },
  });
  ajv.addKeyword({
    keyword: 'x-file', type: 'string', schemaType: 'object', metaSchema: META['x-file'], errors: true,
    validate: function file(spec, value, parentSchema) {
      const dir = this?.dir;
      const path = normalize(spec.under ? join(spec.under, `${value}${spec.suffix ?? ''}`) : `${value}${spec.suffix ?? ''}`);
      if (isAbsolute(path) || path === '.' || path === '..' || path.startsWith(`..${sep}`)) return fail(file, 'x-file', `${value} 须为不离开插件目录的相对路径`, parentSchema);
      if (!dir) return true;
      let found;
      try { found = statSync(join(dir, path)); } catch { return spec.absent ? true : fail(file, 'x-file', `插件目录里没有 ${path}`, parentSchema); }
      if (spec.absent) return fail(file, 'x-file', `插件目录里已有 ${path}`, parentSchema);
      if (spec.type === 'directory' ? !found.isDirectory() : !found.isFile()) return fail(file, 'x-file', `${path} 须为插件目录里的${spec.type === 'directory' ? '目录' : '文件'}`, parentSchema);
      if (spec.contains) try { if (!statSync(join(dir, path, spec.contains)).isFile()) throw new Error(); }
      catch { return fail(file, 'x-file', `${path} 里没有 ${spec.contains}`, parentSchema); }
      if (spec.maxBytes !== undefined && found.size > spec.maxBytes) return fail(file, 'x-file', `${path} 超过 ${spec.maxBytes / 1024} KiB`, parentSchema);
      if (spec.magic) {
        const head = Buffer.alloc(spec.magic.length), fd = openSync(join(dir, path), 'r');
        try { readSync(fd, head, 0, head.length, 0); } finally { closeSync(fd); }
        if (head.toString('latin1') !== spec.magic) return fail(file, 'x-file', `${path} 不是 ${spec.magic.replace(/\W/g, '')}`, parentSchema);
      }
      if (spec.schema) try { declared(JSON.parse(readFileSync(join(dir, path), 'utf8'))); }
      catch (e) { return fail(file, 'x-file', `${path} 不是可用的 JSON Schema：${e.message}`, parentSchema); }
      return true;
    },
  });
}

const ajv = new Ajv2020({ allErrors: false, verbose: true, passContext: true, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
keywords(ajv);
for (const schema of Object.values(SCHEMAS)) ajv.addSchema(schema);
// The validators of the schemas here, by file.
const compiled = new Map();
const validator = file => {
  if (!compiled.has(file)) compiled.set(file, ajv.getSchema(`${BASE}${file}`));
  return compiled.get(file);
};
// The schema an extension point declares, compiled once by what it says, under an ID of its own beside these (whatever `$id`
// it wrote), so that it builds on them as they build on one another (`common.json#/$defs/line40`): its validator, and the
// schema as compiled, for what it says of a failing value. One whose validator answers later (`$async`) says nothing now.
const points = new Map();
function declared(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('须为对象');
  const text = JSON.stringify(schema);
  if (!points.has(text)) {
    const own = { ...schema, $id: `${BASE}point-${createHash('sha256').update(text).digest('hex').slice(0, 16)}.json` };
    const validate = ajv.getSchema(own.$id) ?? ajv.compile(own);
    if (validate.$async) throw new Error('不能是异步的（$async）');
    points.set(text, { validate, schema: own });
  }
  return points.get(text);
}

// Where in the manifest a value is, as a person writes it: `contributes.composerModes[0].in`.
const place = (path, base) => path.split('/').slice(1).map(unescape)
  .reduce((at, step) => /^\d+$/.test(step) ? `${at}[${step}]` : !/^[A-Za-z_$][\w$]*$/.test(step) ? `${at}「${step}」` : at ? `${at}.${step}` : step, base);
const TYPE_NAMES = { array: '数组', object: '对象', string: '文本', number: '数字', integer: '整数', boolean: '开或关' };
// What the schema says of a failing value: the description nearest above the keyword that failed (a branch's `then`, a
// property's), found by where the error says it is, from the schema it failed in (the one a `$ref` names, any of these).
const nodes = function* (node) {
  if (!node || typeof node !== 'object') return;
  yield node;
  for (const child of Object.values(node)) yield* nodes(child);
};
function described(error, { roots = true, schemas = [] } = {}) {
  if (!error.parentSchema) return undefined;
  if (error.parentSchema.description) return roots || !error.parentSchema.$id ? error.parentSchema.description : undefined;
  const steps = error.schemaPath.replace(/^#\//, '').split('/').map(unescape).slice(0, -1);
  for (const root of [...schemas, ...Object.values(SCHEMAS)]) for (const from of nodes(root)) {
    const path = [from];
    for (const step of steps) path.push(path.at(-1)?.[step]);
    if (path.at(-1) !== error.parentSchema) continue;
    const said = path.slice(0, -1).reverse().find(node => typeof node?.description === 'string');
    return roots || !said?.$id ? said?.description : undefined;
  }
  return undefined;
}
// What is wrong, said once: the first error, by its place and what the schema says of the value there.
// What a whole type says of itself is too much for a key it lacks or one written twice: those say only what is wrong.
// `schemas`: those besides these the value was checked against (an extension point's).
export function explain(errors, base = '', schemas = []) {
  const [error] = errors;
  const at = place(error.instancePath, base) || 'package.json', name = error.propertyName ? `「${error.propertyName}」` : '';
  if (error.keyword === 'x-unique-by') return `${at}${name}：${error.message}`;
  if (error.keyword === 'required') { const said = described(error, { roots: false, schemas }); return `${at} 缺 ${error.params.missingProperty}${said ? `：${said}` : ''}`; }
  if (error.keyword === 'additionalProperties' || error.keyword === 'unevaluatedProperties')
    return `${at} 里有不认识的键：${error.params.additionalProperty ?? error.params.unevaluatedProperty}`;
  const said = described(error, { schemas });
  if (error.keyword === 'type') return `${at}${name} 须为${TYPE_NAMES[error.params.type] ?? error.params.type}${said ? `：${said}` : ''}`;
  if (error.keyword === 'x-file') { const own = described(error, { roots: false, schemas }); return `${at}${name}：${error.message}${own ? `（${own}）` : ''}`; }
  return `${at}${name}：${said ?? error.message}`;
}

// A manifest checked against its schema, the files it names in `dir` when given. Returns null, or what is wrong.
export function manifestProblem(manifest, dir = null) {
  const validate = validator('plugin.json');
  return validate.call({ dir }, manifest) ? null : explain(validate.errors);
}
// A value checked against one of the schemas (`ref`: a file, with a fragment, as `composer-modes.json#/$defs/parameters`),
// as a plugin gives it while it runs: null, or what is wrong, at `where`.
export function valueProblem(ref, value, where) {
  const validate = ajv.getSchema(`${BASE}${ref}`) ?? null;
  if (!validate) throw new Error(`没有这个 schema：${ref}`);
  return validate.call({ dir: null }, value) ? null : explain(validate.errors, where);
}
// What a plugin writes for another's extension point (`value`, under `where`, as `contributes.panels`), checked against the
// schema that point declares (the declaring plugin's file, read): null, or what is wrong. `dir`: the writing plugin's
// directory, for the files it names. The schema sees the value alone: its pointers name places in it.
export function pointProblem(schema, value, where, dir = null) {
  const point = declared(schema);
  return point.validate.call({ dir }, value) ? null : explain(point.validate.errors, where, [point.schema]);
}
