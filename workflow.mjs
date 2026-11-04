// Coda's dialect of BPMN 2.0 (workflow/): what a workflow of a project or a plugin may write in Coda's namespace, as a
// bpmn-moddle descriptor (moddle.json); what each of those values may be, as JSON Schemas (values.json); the steps it may
// ask of Coda itself, each with the parameters it takes (actions.json); and the names workflows share (dialect.json):
// their kinds, the events Coda sends, the error code of a failed step, the run's variables an expression reads by name,
// the types a run's inputs take. Coda reads a workflow with them, and coda-plugins' contract check does where a plugin is
// written. readWorkflow checks values and structure: structure.json describes local constraints and structure.mjs
// checks BPMN topology, leaving only compilation to Coda.
// What JSON Schema cannot say of a value it says with these keywords, besides the manifests' (validate.mjs):
// - `x-feel`: true, or { names } — the value is FEEL: an expression when it starts with `=`, else text whose every
//   `{{ … }}` holds one, each reading by name what the workflow has (its nodes and messages, the run's variables, a loop's
//   element), or only `names`;
// - `x-duration`: true — the value is an ISO 8601 duration, not negative;
// - `x-number`: true — the text, read as a number, is a finite one (`1e999` reads as none).
// workflow/keywords.mjs adds x-deferred (check FEEL now, the result later), x-length (UTF-16 text length, optionally
// limited by a sibling), x-json (a JSON value or its text, with a byte budget), and absolute-path / https-url formats.
import { parseDuration } from '@0dep/piso';
import { BpmnModdle } from 'bpmn-moddle';
import { parseExpression } from 'feelin';
import { described, newAjv } from './validate.mjs';
import moddle from './workflow/moddle.json' with { type: 'json' };
import values from './workflow/values.json' with { type: 'json' };
import actions from './workflow/actions.json' with { type: 'json' };
import dialect from './workflow/dialect.json' with { type: 'json' };
import fields from './workflow/fields.json' with { type: 'json' };
import { valueKeywords } from './workflow/keywords.mjs';
import { structureChecker } from './workflow/structure.mjs';
export { CODA_STRUCTURE } from './workflow/structure.mjs';

export const CODA_MODDLE = moddle;
export const CODA_NAMESPACE = moddle.uri;
export const CODA_VALUES = values;
export const CODA_FIELDS = fields;
// Each action by name, with the parameters it takes (`coda:param`).
export const CODA_ACTIONS = Object.fromEntries(Object.entries(actions.actions).map(([name, action]) => [name, action.params]));
export const WORKFLOW_KINDS = Object.keys(dialect.kinds);
// The kinds that deploy or release: a workflow of one runs only commits merged into the default branch.
export const DEPLOYING_KINDS = dialect.deploying;
// The events Coda sends (dialect.json says what each is).
export const CODA_EVENTS = Object.keys(dialect.events);
export const { lifecycleStart: SESSION_OPENED, lifecycleFacts: SESSION_FACTS, dispatch: DISPATCH_EVENT, cancel: CANCEL_EVENT } = dialect.eventRoles;
// A message the user sends from a run's page (`user.<what>`), while the run waits on it.
export const USER_MESSAGE = new RegExp(dialect.userMessage);
export const STEP_FAILED = dialect.stepFailed;
export const RUN_VARIABLES = dialect.variables;
// The types a run's inputs take (`coda:input type`), and where one started from a session takes its value from when given
// none (`defaultFrom`), with the types each gives.
export const INPUT_TYPES = dialect.inputs.types;
export const INPUT_SOURCES = Object.freeze(Object.fromEntries(Object.entries(dialect.inputs.sources).map(([name, types]) => [name, { types }])));

// A value that starts with `=` is a FEEL expression; anything else is text, where each `{{ … }}` holds one.
export const isExpression = value => typeof value === 'string' && value.trimStart().startsWith('=');
const TEMPLATE = /\{\{([\s\S]*?)\}\}/g;
// What the expressions of the engine before FEEL looked like: refused with the way to write it now.
const OLD = /\$\{\s*environment\./;
// FEEL reads every name it is given at each parse, and a workflow has a name for each of its nodes: an expression is given
// only those it mentions.
const mentioned = (expression, names) => Object.fromEntries(Object.entries(names).filter(([name]) => expression.includes(name)));
// Why a value does not read as FEEL, or null: `names`, what it may read by name (an object with them as keys), so that a
// task id like `in-queue` reads as one name.
export function feelProblem(value, names = {}) {
  if (typeof value !== 'string') return null;
  if (OLD.test(value)) return '表达式改用 FEEL，以「=」开头，如 =review.verdict；文字里用 {{ … }}，如 还在验证：{{verifying.what}}（docs/workflows.md「表达式」）';
  const expressions = isExpression(value) ? [value.trimStart().slice(1)] : [...value.matchAll(TEMPLATE)].map(m => m[1]);
  for (const expression of expressions) {
    if (!expression.trim()) return '表达式是空的';
    // A property's name says nothing of the grammar, and what a value holds is known only once read (`vars.probe.every`
    // names a setting, not FEEL's `every`): each is read as a plain one.
    const plain = expression.replace(/\.(?=[A-Za-z_])[\w-]+/g, '.p');
    let error = null;
    parseExpression(plain, mentioned(plain, names)).iterate({ enter(node) { if (node.type.isError && error === null) error = node.from; } });
    if (error !== null) return `「${expression.trim()}」不是有效的 FEEL 表达式（第 ${error + 1} 个字符附近）`;
  }
  return null;
}
// An ISO 8601 duration (`P30D`, `PT6H`), not negative, as bpmn-engine reads its timers.
export function isDuration(text) {
  if (typeof text !== 'string' || !text || text.length > 200) return false;
  try { return parseDuration(text).result.sign !== -1; } catch { return false; }
}

const ajv = newAjv();
valueKeywords(ajv, { feelProblem, isExpression });
ajv.addKeyword({
  keyword: 'x-feel', type: 'string', schemaType: ['boolean', 'object'], errors: true,
  metaSchema: { anyOf: [{ type: 'boolean' }, { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, required: ['names'], additionalProperties: false }] },
  compile(spec, parentSchema) {
    const own = typeof spec === 'object' ? Object.fromEntries(spec.names.map(name => [name, null])) : null;
    return function feel(value) {
      const problem = spec ? feelProblem(value, own ?? this?.names ?? {}) : null;
      if (problem) feel.errors = [{ keyword: 'x-feel', message: problem, params: {}, parentSchema }];
      return !problem;
    };
  },
});
ajv.addKeyword({ keyword: 'x-duration', type: 'string', schemaType: 'boolean', compile: spec => value => !spec || isDuration(value) });
ajv.addKeyword({ keyword: 'x-number', type: 'string', schemaType: 'boolean', compile: spec => value => !spec || Number.isFinite(Number(value)) });
ajv.addSchema(fields);
ajv.addSchema(values);
const structureProblem = structureChecker(ajv, { feelProblem, isExpression });
const checks = new Map();
// The validator of a definition of values.json, by its name; none for a type it says nothing of.
const check = name => {
  if (!checks.has(name)) checks.set(name, Object.hasOwn(values.$defs, name) ? ajv.getSchema(`${values.$id}#/$defs/${name}`) : null);
  return checks.get(name);
};

const SIZE_LIMIT = 1_000_000;
// bpmn-moddle rewrites a descriptor as it takes it in (its names get their prefix), and whoever imports CODA_MODDLE may hand
// it to one: what is read here is a copy taken as this loads, and each parse is given a copy of its own.
const DESCRIPTOR = structuredClone(moddle);
// moddle's Boolean/Integer coercion accepts `no` as false and `1.5` as 1. Keep field attributes as text until their
// complete spelling is known; valid ones are restored to the descriptor's types before returning the parsed workflow.
const FIELD_SCALARS = DESCRIPTOR.types.find(type => type.name === 'Field').properties.filter(p => ['Boolean', 'Integer'].includes(p.type));
const PARSER_DESCRIPTOR = structuredClone(DESCRIPTOR);
for (const property of PARSER_DESCRIPTOR.types.find(type => type.name === 'Field').properties)
  if (FIELD_SCALARS.some(p => p.name === property.name)) property.type = 'String';
const children = element => Object.values(element).flatMap(v => (Array.isArray(v) ? v : [v])).filter(v => v?.$type && v.$parent === element);
// Everything in the definition under `element`, depth first, by a stack of its own, pushed one at a time: a definition may
// nest deeper than the call stack goes, and hold more in one place than a call takes arguments.
const all = element => {
  const found = [], stack = [], push = kids => { for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]); };
  push(children(element));
  while (stack.length) { const next = stack.pop(); found.push(next); push(children(next)); }
  return found;
};
const TYPES = new Map(DESCRIPTOR.types.map(type => [type.name, type]));
const codaType = element => element.$type.startsWith('coda:') ? TYPES.get(element.$type.slice(5)) : undefined;
const lower = name => `${name[0].toLowerCase()}${name.slice(1)}`;
// The attributes `type` declares that `element` has, as moddle read them.
const attributes = (element, type) => Object.fromEntries(type.properties.filter(p => p.isAttr && element[p.name] !== undefined).map(p => [p.name, element[p.name]]));
// A coda: element as one object: its attributes, and the coda: elements it holds (`isMany`), each as its attributes.
function codaObject(element) {
  const type = codaType(element), object = attributes(element, type);
  for (const p of type.properties.filter(p => p.isMany && element[p.name]?.length)) object[p.name] = element[p.name].map(child => attributes(child, codaType(child)));
  return object;
}
// The element of the process a coda: element is written in: the nearest around it of BPMN's with an id.
const owner = element => { let at = element.$parent; while (at && (codaType(at) || !at.id)) at = at.$parent; return at; };
// What is wrong, said once, as Coda says it: where (`at`), then what the schema says of the value there. `attribute`: the
// object is a BPMN element's coda: attributes, whose names are said with their prefix.
function said(error, at, attribute) {
  const key = error.instancePath.split('/')[1], name = key === undefined ? '' : `${attribute ? 'coda:' : ''}${key}`;
  if (error.keyword === 'x-feel') return `${at}${key && key !== 'value' ? ` 的 ${name}` : ''}：${error.message}`;
  if (error.keyword === 'required') {
    const own = error.parentSchema?.description;
    return `${at} 需要 ${attribute ? 'coda:' : ''}${error.params.missingProperty}${own ? `：${own}` : ''}`;
  }
  if (error.keyword === 'x-unique-by') return `${at}：${error.message}`;
  return `${at}：${description(error)}`;
}
const description = (error, object = {}) => (described(error, { schemas: [values, fields] }) ?? error.message)
  .replace(/\{(\w+)\}/g, (whole, key) => Object.hasOwn(error.params, key) ? String(error.params[key])
    : object && Object.hasOwn(object, key) ? String(object[key]) : whole);
// Required values and allowed attributes come from the same schema as validation; none of the field types is named here.
function fieldSaid(error, at, field) {
  if (error.keyword === 'additionalProperties') {
    const allowed = Object.keys(error.parentSchema.properties), type = error.parentSchema.properties.type.const;
    const extra = Object.keys(error.data).filter(key => !Object.hasOwn(error.parentSchema.properties, key));
    return `${at}：${type} 字段没有 ${extra.join('、')}，可写 ${allowed.join('、')}`;
  }
  return `${at}：${error.keyword === 'x-feel' ? error.message : description(error, field)}`;
}
// A resolved field, at task opening or when accepting an answer. No expression is evaluated and no default is inserted.
export function fieldProblem(field, where = '字段') {
  const validate = ajv.getSchema(fields.$id);
  return validate(field) ? null : fieldSaid(validate.errors[0], where, field);
}
// The expanded fields of one task (after reading coda:fields JSON and applying host/dir), checked together as in a
// definition. Choice references still need the task's choices; Coda checks those after expansion.
let fieldsBound;
export function fieldsProblem(list, where = '任务') {
  const schema = values.$defs['UserTask.children'].properties.field;
  // Check the bound before visiting items, and individual values before uniqueness can inspect their ids.
  const { 'x-unique-by': unique, ...shape } = schema;
  const bound = fieldsBound ??= ajv.compile(shape);
  if (!bound(list)) return `${where}：${description(bound.errors[0])}`;
  for (const [index, field] of list.entries()) {
    const problem = fieldProblem(field, `${where} 的字段 ${typeof field?.id === 'string' ? field.id : index + 1}`);
    if (problem) return problem;
  }
  const validate = ajv.getSchema(`${values.$id}#/$defs/UserTask.children/properties/field`);
  return validate(list) ? null : `${where}：字段 id 重复：${validate.errors[0].message.slice('id 不能重复：'.length)}`;
}
// What of the coda: values in the definition its schemas do not take, or null: each element in order, its coda:
// attributes by each type of Coda's extending what it is, the coda: elements it holds by kind, and each coda: element.
function valuesProblem(root) {
  const elements = all(root);
  // What an expression may read by name: the run's own variables, each node's result and each message's latest, and in a
  // loop its element and `loopCounter`.
  const loops = elements.filter(e => e.$type === 'bpmn:MultiInstanceLoopCharacteristics');
  const names = Object.fromEntries([...RUN_VARIABLES, ...elements.filter(e => e.$type === 'bpmn:Message' || e.$instanceOf?.('bpmn:FlowElement')).map(e => e.id),
    ...loops.map(loop => loop.inputElement).filter(Boolean), ...(loops.length ? ['loopCounter'] : [])].filter(Boolean).map(name => [name, null]));
  const failed = (validate, object, at, attribute, field = false) => validate && !validate.call({ names, definition: true }, object)
    ? field ? fieldSaid(validate.errors[0], at, object) : said(validate.errors[0], at, attribute) : null;
  for (const element of elements) {
    const type = codaType(element);
    if (type) {
      const name = element.id ?? element.name, kind = type.name === 'Choice' && element.$parent?.$type === 'coda:Choice' ? 'NestedChoice' : type.name;
      const problem = failed(check(kind), codaObject(element), `${owner(element)?.id} 的 coda:${lower(type.name)}${name ? ` ${name}` : ''}`, false, ['Field', 'Fields'].includes(kind));
      if (problem) return problem;
      continue;
    }
    if (element.$type?.startsWith('bpmn:') !== true || !element.$instanceOf) continue;
    const at = element.id ?? owner(element)?.id;
    for (const extending of DESCRIPTOR.types.filter(t => t.extends?.some(on => element.$instanceOf(on)))) {
      const problem = failed(check(extending.name), attributes(element, extending), at, true);
      if (problem) return problem;
    }
    const held = (element.extensionElements?.values ?? []).filter(codaType);
    if (!held.length) continue;
    const grouped = {};
    for (const child of held) (grouped[lower(codaType(child).name)] ??= []).push(codaObject(child));
    const validate = check(`${element.$type.slice(5)}.children`);
    let problem = failed(validate, grouped, at, false);
    if (problem && validate.errors[0].keyword === 'x-ref') {
      const error = validate.errors[0], path = error.instancePath.split('/').slice(1);
      let parent = grouped;
      for (const key of path.slice(0, -1)) parent = parent[key];
      problem = `${at} 的 coda:choice ${parent.id}：${description(error)}`;
    }
    if (problem && validate.errors[0].keyword === 'x-unique-by' && validate.errors[0].instancePath === '/field')
      problem = `${at}：字段 id 重复：${validate.errors[0].message.slice('id 不能重复：'.length)}`;
    if (problem) return problem;
  }
  return null;
}

// A workflow's definition (`file`, its name without `.bpmn`, for what is said) read with Coda's dialect: `{ root }`, the
// parsed definitions, or `{ problem }`, what of it the dialect does not have — not BPMN, a coda: attribute or element it
// does not know, an action it does not have or a parameter that action does not take — or a value of it its schema does
// not take, or a structure the workflow cannot run with.
export async function readWorkflow(source, file = 'workflow') {
  if (typeof source !== 'string' || source.length > SIZE_LIMIT) return { problem: `${file}.bpmn 过大` };
  const old = OLD.exec(source);
  if (old) return { problem: `${file}.bpmn 第 ${source.slice(0, old.index).split('\n').length} 行：${feelProblem(old[0])}` };
  let parsed;
  try { parsed = await new BpmnModdle({ coda: structuredClone(PARSER_DESCRIPTOR) }).fromXML(source); }
  catch (e) { return { problem: `${file}.bpmn 不是有效的 BPMN 2.0：${e.message}` }; }
  const { rootElement: root, warnings } = parsed;
  if (warnings.length) return { problem: `${file}.bpmn 有无法识别的内容：${warnings.slice(0, 3).map(w => w.message).join('；')}` };
  for (const field of all(root).filter(e => e.$type === 'coda:Field')) for (const { name, type } of FIELD_SCALARS) {
    const value = field[name];
    if (type === 'Boolean' && ['true', 'false'].includes(value)) field[name] = value === 'true';
    if (type === 'Integer' && typeof value === 'string' && /^[+-]?\d+$/.test(value)) field[name] = Number(value);
  }
  for (const task of all(root).filter(e => e.$type === 'bpmn:ServiceTask' && e.action !== undefined)) {
    if (!Object.hasOwn(CODA_ACTIONS, task.action)) return { problem: `${task.id}：coda:action 只能是 ${Object.keys(CODA_ACTIONS).join('、')}` };
    const params = CODA_ACTIONS[task.action];
    const given = (task.extensionElements?.values ?? []).filter(v => v.$type === 'coda:Param');
    if (given.some(p => !params.includes(p.name))) return { problem: `${task.id}：coda:action ${task.action} 只接受参数 ${params.join('、')}` };
  }
  const problem = valuesProblem(root) ?? structureProblem(root, file);
  return problem ? { problem } : { root };
}
// What of a workflow's definition the dialect does not have, or null.
export async function workflowProblem(source, file) {
  return (await readWorkflow(source, file)).problem ?? null;
}
