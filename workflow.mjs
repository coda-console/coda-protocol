// Coda's dialect of BPMN 2.0 (workflow/): what a workflow of a project or a plugin may write in Coda's namespace, as a
// bpmn-moddle descriptor (moddle.json); what each of those values may be, as JSON Schemas (values.json); the steps it may
// ask of Coda itself, each with the parameters it takes (actions.json); and the names workflows share (dialect.json):
// their kinds, the events Coda sends, the error code of a failed step, the run's variables an expression reads by name,
// the types a run's inputs take. Coda reads a workflow with them, and coda-plugins' contract check does where a plugin is
// written. readWorkflow refuses what the dialect does not have and a value of it its schema does not take; how the
// process itself is put together is still Coda's to check as it reads the workflow.
// What JSON Schema cannot say of a value it says with two keywords of its own, besides the manifests' (validate.mjs):
// - `x-feel`: true, or { names } — the value is FEEL: an expression when it starts with `=`, else text whose every
//   `{{ … }}` holds one, each reading by name what the workflow has (its nodes and messages, the run's variables, a loop's
//   element), or only `names`;
// - `x-duration`: true — the value is an ISO 8601 duration, not negative.
import { parseDuration } from '@0dep/piso';
import { BpmnModdle } from 'bpmn-moddle';
import { parseExpression } from 'feelin';
import { described, newAjv } from './validate.mjs';
import moddle from './workflow/moddle.json' with { type: 'json' };
import values from './workflow/values.json' with { type: 'json' };
import actions from './workflow/actions.json' with { type: 'json' };
import dialect from './workflow/dialect.json' with { type: 'json' };

export const CODA_MODDLE = moddle;
export const CODA_NAMESPACE = moddle.uri;
export const CODA_VALUES = values;
// Each action by name, with the parameters it takes (`coda:param`).
export const CODA_ACTIONS = Object.fromEntries(Object.entries(actions.actions).map(([name, action]) => [name, action.params]));
export const WORKFLOW_KINDS = Object.keys(dialect.kinds);
// The kinds that deploy or release: a workflow of one runs only commits merged into the default branch.
export const DEPLOYING_KINDS = dialect.deploying;
// The events Coda sends (dialect.json says what each is).
export const CODA_EVENTS = Object.keys(dialect.events);
export const SESSION_OPENED = 'session.opened', SESSION_FACTS = 'session.facts', DISPATCH_EVENT = 'workflow.dispatch', CANCEL_EVENT = 'workflow.cancel';
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
ajv.addSchema(values);
const checks = new Map();
// The validator of a definition of values.json, by its name; none for a type it says nothing of.
const check = name => {
  if (!checks.has(name)) checks.set(name, values.$defs[name] ? ajv.getSchema(`${values.$id}#/$defs/${name}`) : null);
  return checks.get(name);
};

const SIZE_LIMIT = 1_000_000;
// bpmn-moddle rewrites a descriptor as it takes it in (its names get their prefix), and whoever imports CODA_MODDLE may hand
// it to one: what is read here is a copy taken as this loads, and each parse is given a copy of its own.
const DESCRIPTOR = structuredClone(moddle);
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
  return `${at}：${described(error, { schemas: [values] }) ?? error.message}`;
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
  const failed = (validate, object, at, attribute) => validate && !validate.call({ names }, object) ? said(validate.errors[0], at, attribute) : null;
  for (const element of elements) {
    const type = codaType(element);
    if (type) {
      const name = element.id ?? element.name, kind = type.name === 'Choice' && element.$parent?.$type === 'coda:Choice' ? 'NestedChoice' : type.name;
      const problem = failed(check(kind), codaObject(element), `${owner(element)?.id} 的 coda:${lower(type.name)}${name ? ` ${name}` : ''}`, false);
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
    const problem = failed(check(`${element.$type.slice(5)}.children`), grouped, at, false);
    if (problem) return problem;
  }
  return null;
}

// A workflow's definition (`file`, its name without `.bpmn`, for what is said) read with Coda's dialect: `{ root }`, the
// parsed definitions, or `{ problem }`, what of it the dialect does not have — not BPMN, a coda: attribute or element it
// does not know, an action it does not have or a parameter that action does not take — or a value of it its schema does
// not take.
export async function readWorkflow(source, file = 'workflow') {
  if (typeof source !== 'string' || source.length > SIZE_LIMIT) return { problem: `${file}.bpmn 过大` };
  let parsed;
  try { parsed = await new BpmnModdle({ coda: structuredClone(DESCRIPTOR) }).fromXML(source); }
  catch (e) { return { problem: `${file}.bpmn 不是有效的 BPMN 2.0：${e.message}` }; }
  const { rootElement: root, warnings } = parsed;
  if (warnings.length) return { problem: `${file}.bpmn 有无法识别的内容：${warnings.slice(0, 3).map(w => w.message).join('；')}` };
  for (const task of all(root).filter(e => e.$type === 'bpmn:ServiceTask' && e.action !== undefined)) {
    if (!Object.hasOwn(CODA_ACTIONS, task.action)) return { problem: `${task.id}：coda:action 只能是 ${Object.keys(CODA_ACTIONS).join('、')}` };
    const params = CODA_ACTIONS[task.action];
    const given = (task.extensionElements?.values ?? []).filter(v => v.$type === 'coda:Param');
    if (given.some(p => !params.includes(p.name))) return { problem: `${task.id}：coda:action ${task.action} 只接受参数 ${params.join('、')}` };
  }
  const problem = valuesProblem(root);
  return problem ? { problem } : { root };
}
// What of a workflow's definition the dialect does not have, or null.
export async function workflowProblem(source, file) {
  return (await readWorkflow(source, file)).problem ?? null;
}
