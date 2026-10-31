// Coda's dialect of BPMN 2.0 (workflow/): what a workflow of a project or a plugin may write in Coda's namespace, as a
// bpmn-moddle descriptor (moddle.json); the steps it may ask of Coda itself, each with the parameters it takes
// (actions.json); and the names workflows share (dialect.json): their kinds, the events Coda sends, the error code of a
// failed step, the run's variables an expression reads by name. Coda reads a workflow with them, and coda-plugins'
// contract check does where a plugin is written. readWorkflow refuses what the dialect does not have; what each value may
// be is still Coda's to check as it reads the workflow.
import { BpmnModdle } from 'bpmn-moddle';
import moddle from './workflow/moddle.json' with { type: 'json' };
import actions from './workflow/actions.json' with { type: 'json' };
import dialect from './workflow/dialect.json' with { type: 'json' };

export const CODA_MODDLE = moddle;
export const CODA_NAMESPACE = moddle.uri;
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

const SIZE_LIMIT = 1_000_000;
const children = element => Object.values(element).flatMap(v => (Array.isArray(v) ? v : [v])).filter(v => v?.$type && v.$parent === element);
// Everything in the definition under `element`, depth first, by a stack of its own, pushed one at a time: a definition may
// nest deeper than the call stack goes, and hold more in one place than a call takes arguments.
const all = element => {
  const found = [], stack = [], push = kids => { for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]); };
  push(children(element));
  while (stack.length) { const next = stack.pop(); found.push(next); push(children(next)); }
  return found;
};

// A workflow's definition (`file`, its name without `.bpmn`, for what is said) read with Coda's dialect: `{ root }`, the
// parsed definitions, or `{ problem }`, what of it the dialect does not have — not BPMN, a coda: attribute or element it
// does not know, an action it does not have or a parameter that action does not take.
export async function readWorkflow(source, file = 'workflow') {
  if (typeof source !== 'string' || source.length > SIZE_LIMIT) return { problem: `${file}.bpmn 过大` };
  let parsed;
  try { parsed = await new BpmnModdle({ coda: CODA_MODDLE }).fromXML(source); }
  catch (e) { return { problem: `${file}.bpmn 不是有效的 BPMN 2.0：${e.message}` }; }
  const { rootElement: root, warnings } = parsed;
  if (warnings.length) return { problem: `${file}.bpmn 有无法识别的内容：${warnings.slice(0, 3).map(w => w.message).join('；')}` };
  for (const task of all(root).filter(e => e.$type === 'bpmn:ServiceTask' && e.action !== undefined)) {
    if (!Object.hasOwn(CODA_ACTIONS, task.action)) return { problem: `${task.id}：coda:action 只能是 ${Object.keys(CODA_ACTIONS).join('、')}` };
    const params = CODA_ACTIONS[task.action];
    const given = (task.extensionElements?.values ?? []).filter(v => v.$type === 'coda:Param');
    if (given.some(p => !params.includes(p.name))) return { problem: `${task.id}：coda:action ${task.action} 只接受参数 ${params.join('、')}` };
  }
  return { root };
}
// What of a workflow's definition the dialect does not have, or null.
export async function workflowProblem(source, file) {
  return (await readWorkflow(source, file)).problem ?? null;
}
