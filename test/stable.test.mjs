import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMAS, newAjv } from '../validate.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const stable = read('../stable/manifest.json');
const pi = read('./fixtures/stable/sealiu1997-coda_plugins_pi_agent@c968f99/package.json');
const company = read('./fixtures/stable/company-synthetic/package.json');
const resource = read('./fixtures/stable/sealiu1997-coda_plugins_resource_manager@b18fbaf/package.json');
// Witnesses select the actual if/then/else branches. Extra witnesses cover the five promised Agent fields.
const agent = structuredClone(pi.contributes.agents[0]);
Object.assign(agent.modes, { unset: '默认', auto: '自动', full: '完全' });
Object.assign(agent.icon, { dark: 'dark.pdf', template: true });
const witnesses = [pi, company, resource, { contributes: { agents: [agent] } }];
const ajv = newAjv({ strict: false });
for (const schema of Object.values(SCHEMAS)) ajv.addSchema(schema);
// Only the syntax encountered on these paths is understood. Unknown syntax must stop the check.
const known = new Set('$schema $id $defs title description type properties required additionalProperties propertyNames items allOf anyOf if then else not $ref unevaluatedProperties enum const pattern minLength maxLength minimum maximum minItems maxItems uniqueItems minProperties maxProperties x-file x-ref x-unique-by x-max-contains x-placeholders'.split(' '));
function syntax(schema, document) {
  if (typeof schema === 'boolean') return;
  for (const key of Object.keys(schema)) assert.ok(known.has(key), `不支持 schema 写法：${key}（${document.$id}）`);
  for (const child of Object.values(schema.properties ?? {})) syntax(child, document);
  for (const key of ['items', 'additionalProperties', 'propertyNames', 'if', 'then', 'else', 'not'])
    if (Object.hasOwn(schema, key)) syntax(schema[key], document);
  for (const key of ['allOf', 'anyOf']) for (const child of schema[key] ?? []) syntax(child, document);
}
const check = (schema, document, value) => typeof schema === 'boolean' ? schema : ajv.compile({ ...schema, $id: undefined, $ref: schema.$ref && new URL(schema.$ref, document.$id).href })(value);

function expand(schema, document, value) {
  assert.notEqual(schema, false, 'schema 为 false');
  if (schema === true) return [{ schema, document }];
  syntax(schema, document);
  const nodes = [{ schema, document }];
  if (schema.$ref) {
    const url = new URL(schema.$ref, document.$id), [base, pointer = ''] = url.href.split('#');
    const target = Object.values(SCHEMAS).find(item => item.$id === base);
    assert.ok(target, `不支持的 $ref：${url}`);
    const resolved = pointer ? pointer.slice(1).split('/').reduce((node, key) => node[key.replaceAll('~1', '/').replaceAll('~0', '~')], target) : target;
    nodes.push(...expand(resolved, target, value));
  }
  for (const part of schema.allOf ?? []) nodes.push(...expand(part, document, value));
  if (schema.anyOf) {
    const branches = schema.anyOf.filter(part => check(part, document, value));
    assert.ok(branches.length, '稳定路径的样本不满足 anyOf');
    for (const part of branches) nodes.push(...expand(part, document, value));
  }
  if (Object.hasOwn(schema, 'not')) assert.equal(check(schema.not, document, value), false, '稳定路径的样本被 not 拒绝');
  if (Object.hasOwn(schema, 'if')) {
    const branch = check(schema.if, document, value) ? schema.then : schema.else;
    if (branch !== undefined) nodes.push(...expand(branch, document, value));
  }
  return nodes;
}

// Enumerate concrete sample routes first; schema errors are never treated as missing sample data.
function routes(value, steps) {
  if (!steps.length) return [[]];
  const [step, ...rest] = steps;
  if (value === null || typeof value !== 'object') return [];
  const keys = step === '[]' ? (Array.isArray(value) ? Object.keys(value) : [])
    : step === '*' ? Object.keys(value) : Object.hasOwn(value, step) ? [step] : [];
  return keys.flatMap(key => routes(value[key], rest).map(tail => [{ step, key }, ...tail]));
}
function walk(input, value, route) {
  const nodes = input.flatMap(({ schema, document }) => expand(schema, document, value));
  if (!route.length) return nodes;
  const [{ step, key }, ...rest] = route;
  const children = nodes.flatMap(({ schema: node, document }) => {
    const child = step === '[]' ? node.items : step === '*' ? node.additionalProperties : node.properties?.[step];
    return child === undefined ? [] : [{ schema: child, document }];
  });
  assert.ok(children.length, `schema 中走不到 ${step}`);
  return walk(children, value[key], rest);
}

for (const { path, values } of stable.entries) {
  test(`stable schema path: ${path}`, () => {
    const steps = path.replaceAll('[]', '.[]').split('.');
    let file = 'plugin.json', tail = steps;
    // These three are Coda contribution points, rather than plugin.json's general keys.
    if (steps[0] === 'contributes' && ['agents', 'skills', 'commands'].includes(steps[1])) {
      file = `${steps[1]}.json`; tail = steps.slice(2);
    }
    const found = [];
    for (const witness of witnesses) {
      const value = file === 'plugin.json' ? witness : witness.contributes?.[steps[1]];
      for (const route of routes(value, tail))
        found.push(walk([{ schema: SCHEMAS[file], document: SCHEMAS[file] }], value, route));
    }
    assert.ok(found.length, `没有覆盖 ${path} 的样本`);
    for (const value of values ?? [])
      assert.ok(found.some(nodes => nodes.every(({ schema, document }) => check(schema, document, value))), `${path} 不再接受 ${value}`);
  });
}
