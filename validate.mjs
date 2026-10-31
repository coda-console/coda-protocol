// A plugin is right when what it writes is of the types it names: each key of a manifest's `contributes` is a type with a
// JSON Schema of its own (schemas/plugin/, `https://coda.pub/schemas/plugin/v1/…`), and a key that is no type of Coda's is
// one a plugin's extension point declares, for that plugin to read: of the schema that point names, a file of the declaring
// plugin's (`extensionPoints.<point>.schema`), when it names one. Checking one is checking it against those schemas,
// nothing else: a field joins a type by joining its schema, never by a rule here. Coda checks a plugin with this module
// when it reads one, and coda-plugins' contract check does where a plugin is written.
// What JSON Schema cannot say of one value alone it says with five keywords, each meaning one thing wherever it is written,
// as Kubernetes extends its OpenAPI with `x-kubernetes-*`:
// - `x-unique-by`: [name, { part } or { key, nested }] — in an array, each named property of its objects is unique among the
//   items having it, and so is `part`'s first group of each of its texts (a directory's last name), and `key` among the
//   items and those in their `nested` arrays, at every depth (a task's answers and those offered on holding one);
// - `x-max-contains`: { match, max } — of an object's values, at most `max` satisfy `match` (`maxContains` of an object);
// - `x-ref`: { pointer, part?, key?, split?, match? } — the value (or `part`'s first group of it), or each nonempty token
//   separated by `split`, names a key of the object, or an element (with `key`, that property of an element)
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

// What a pointer names, from where a keyword is: the manifest's root, or levels up from the value itself; and where that is.
function locate(pointer, { rootData, instancePath }) {
  const relative = /^(\d+)(.*)$/.exec(pointer);
  const up = relative ? Number(relative[1]) : 0, rest = relative ? relative[2] : pointer;
  const here = instancePath.split('/').slice(1).map(unescape);
  if (up > here.length) return { at: undefined, path: '' };
  const steps = [...(relative ? here.slice(0, here.length - up) : []), ...rest.split('/').slice(1).map(unescape)];
  return { at: steps.reduce((at, step) => at !== null && typeof at === 'object' && Object.hasOwn(at, step) ? at[step] : undefined, rootData),
    path: steps.map(step => `/${escape(step)}`).join('') };
}
const unescape = step => step.replace(/~1/g, '/').replace(/~0/g, '~');
const escape = step => String(step).replace(/~/g, '~0').replace(/\//g, '~1');
const fail = (validate, keyword, message, parentSchema) => { validate.errors = [{ keyword, message, params: {}, parentSchema }]; return false; };

// What each keyword is written with, checked where a schema using it is compiled: one written wrong is refused there, as an
// extension point's schema is (x-file `schema`), not where a value is checked against it.
const SCHEMA_VALUE = { type: ['object', 'boolean'] };
const META = {
  'x-max-contains': { type: 'object', properties: { match: SCHEMA_VALUE, max: { type: 'integer', minimum: 0 } }, required: ['match', 'max'], additionalProperties: false },
  'x-unique-by': { type: 'array', minItems: 1, items: { anyOf: [{ type: 'string' },
    { type: 'object', properties: { part: { type: 'string' } }, required: ['part'], additionalProperties: false },
    { type: 'object', properties: { key: { type: 'string' }, nested: { type: 'string' } }, required: ['key', 'nested'], additionalProperties: false }] } },
  'x-ref': { type: 'object', properties: { pointer: { type: 'string', pattern: '^(?:\\d+(?:/.*)?|/.*)$' }, part: { type: 'string' }, key: { type: 'string' }, split: { type: 'string' }, match: SCHEMA_VALUE },
    required: ['pointer'], additionalProperties: false },
  'x-placeholders': { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } }, config: SCHEMA_VALUE }, additionalProperties: false },
  'x-file': { type: 'object', properties: { type: { enum: ['file', 'directory'] }, under: { type: 'string' }, suffix: { type: 'string' }, contains: { type: 'string' },
    maxBytes: { type: 'integer', minimum: 0 }, magic: { type: 'string' }, schema: { type: 'boolean' }, absent: { type: 'boolean' } },
    required: ['type'], additionalProperties: false },
};

// A validator that answers now: one of a schema written `$async` answers later, with a promise that would pass for a yes.
function now(validate) {
  if (validate.$async) throw new Error('不能是异步的（$async）');
  return validate;
}

// A schema a keyword is written with (`match`, `config`), for a value elsewhere in what is checked: compiled on its own as a
// validator that answers now, and run as one part of the whole — with what the whole is checked with (`self`, Ajv's context:
// the plugin's directory), on the whole value, at the value's place in it — so that its pointers and files are as the
// schema around it has them.
function inner(ajv, schema) {
  const validate = now(ajv.compile(schema));
  return (self, value, path, { rootData }) => validate.call(self, value, { instancePath: path, rootData, dynamicAnchors: {} });
}

function keywords(ajv) {
  ajv.addKeyword({
    keyword: 'x-max-contains', type: 'object', schemaType: 'object', metaSchema: META['x-max-contains'],
    compile({ match, max }) {
      const matches = inner(ajv, match);
      return function (value, cxt) {
        return Object.entries(value).filter(([key, each]) => matches(this, each, `${cxt.instancePath}/${escape(key)}`, cxt)).length <= max;
      };
    },
  });
  ajv.addKeyword({
    keyword: 'x-unique-by', type: 'array', schemaType: 'array', metaSchema: META['x-unique-by'], errors: true,
    compile(keys, parentSchema) {
      const by = keys.map(key => typeof key !== 'object' ? { key } : key.part !== undefined ? { part: new RegExp(key.part, 'u') } : key);
      // The items, and with `nested` those in each one's array of that name, at every depth: by a stack of its own.
      const every = (items, nested) => {
        if (!nested) return items;
        const found = [], stack = [...items].reverse();
        while (stack.length) {
          const item = stack.pop();
          found.push(item);
          const inner = item && typeof item === 'object' ? item[nested] : undefined;
          if (Array.isArray(inner)) for (let i = inner.length - 1; i >= 0; i--) stack.push(inner[i]);
        }
        return found;
      };
      return function unique(items) {
        for (const { key, part, nested } of by) {
          const seen = new Set();
          for (const item of every(items, nested)) {
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
  function resolves(self, ref, matches, name, cxt) {
    const { at, path } = locate(ref.pointer, cxt);
    const key = Array.isArray(at) ? ref.key === undefined ? at.indexOf(name)
      : at.findIndex(item => item !== null && typeof item === 'object' && Object.hasOwn(item, ref.key) && item[ref.key] === name)
      : at !== null && typeof at === 'object' && Object.hasOwn(at, name) ? name : -1;
    return key !== -1 && (!matches || matches(self, at[key], `${path}/${escape(key)}`, cxt));
  }
  ajv.addKeyword({
    keyword: 'x-ref', type: 'string', schemaType: 'object', metaSchema: META['x-ref'], errors: true,
    compile(ref, parentSchema) {
      const matches = ref.match !== undefined ? inner(ajv, ref.match) : null, part = ref.part !== undefined ? new RegExp(ref.part, 'u') : null;
      const split = ref.split === undefined ? null : new RegExp(ref.split, 'u');
      return function reference(value, cxt) {
        for (const token of split ? value.split(split).filter(Boolean) : [value]) {
          const name = part ? part.exec(token)?.[1] : token;
          if (name !== undefined && resolves(this, ref, matches, name, cxt)) continue;
          reference.errors = [{ keyword: 'x-ref', params: { value: token }, parentSchema, message: '引用不存在或类型不符' }];
          return false;
        }
        return true;
      };
    },
  });
  ajv.addKeyword({
    keyword: 'x-placeholders', type: 'string', schemaType: 'object', metaSchema: META['x-placeholders'],
    compile(allowed) {
      const config = allowed.config !== undefined ? { pointer: '/contributes/configuration/properties' } : null, matches = config && inner(ajv, allowed.config);
      return function (value, cxt) {
        return [...value.matchAll(/\$\{([^}]*)\}/g)].every(([, place]) => {
          if ((allowed.names ?? []).includes(place)) return true;
          const setting = /^config:(.+)$/.exec(place)?.[1];
          return !!(config && setting && resolves(this, config, matches, setting, cxt));
        });
      };
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

// An Ajv as these schemas are checked with, the keywords above in it: also for the schemas of the protocol's other parts
// (workflow.mjs), which add their own keywords to it.
export function newAjv() {
  const made = new Ajv2020({ allErrors: false, verbose: true, passContext: true, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
  keywords(made);
  return made;
}
const ajv = newAjv();
for (const schema of Object.values(SCHEMAS)) ajv.addSchema(schema);
// The validators of the schemas here, by file.
const compiled = new Map();
const validator = file => {
  if (!compiled.has(file)) compiled.set(file, ajv.getSchema(`${BASE}${file}`));
  return compiled.get(file);
};
// The schema an extension point declares, compiled once by what it says, under an ID of its own beside these (whatever `$id`
// it wrote), so that it builds on them as they build on one another (`common.json#/$defs/line40`): its validator, and the
// schema as compiled, for what it says of a failing value. One that answers later (`$async`) is refused.
const points = new Map();
function declared(schema) {
  const text = JSON.stringify(schema);
  if (!points.has(text)) {
    // `true` and `false` say all they say as they are; what is no schema at all Ajv refuses.
    const object = schema !== null && typeof schema === 'object' && !Array.isArray(schema);
    const own = object ? { ...schema, $id: `${BASE}point-${createHash('sha256').update(text).digest('hex').slice(0, 16)}.json` } : schema;
    points.set(text, { validate: now((object && ajv.getSchema(own.$id)) || ajv.compile(own)), schema: own });
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
export function described(error, { roots = true, schemas = [] } = {}) {
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
