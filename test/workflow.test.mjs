// Reading a workflow with Coda's dialect: one written in it is read, and each kind of thing the dialect does not have is
// said, one at a time.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CANCEL_EVENT, CODA_ACTIONS, CODA_EVENTS, CODA_MODDLE, DEPLOYING_KINDS, DISPATCH_EVENT, readWorkflow, SESSION_FACTS, SESSION_OPENED, WORKFLOW_KINDS,
  workflowProblem } from '../workflow.mjs';

// A workflow of one process holding `body`, `process` the process element's own attributes.
const workflow = (body, process = '') => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:coda="${CODA_MODDLE.uri}" targetNamespace="https://coda.pub/test">
  <process id="p" isExecutable="true"${process}>${body}</process>
</definitions>`;

test('a workflow written in the dialect is read: Coda\'s attributes and elements, an action with the parameters it takes', async () => {
  const source = workflow(`
    <startEvent id="start" />
    <scriptTask id="build" coda:timeout="10" coda:checkout="false" coda:status="构建中" scriptFormat="bash">
      <extensionElements><coda:env name="HEAD" value="=inputs.head" /><coda:output name="version" /></extensionElements>
      <script>echo "version=1" >> "$GITHUB_OUTPUT"</script>
    </scriptTask>
    <serviceTask id="deploy" coda:action="run-workflows">
      <extensionElements><coda:param name="kind" value="deploy" /><coda:param name="commit" value="=inputs.head" /></extensionElements>
    </serviceTask>
    <userTask id="approve" coda:assignee="user">
      <extensionElements><coda:choice id="merge" name="合并" primary="true"><coda:option id="deploy" name="部署" /></coda:choice></extensionElements>
    </userTask>`, ' coda:kind="deploy" coda:title="部署"');
  const { root, problem } = await readWorkflow(source, 'deploy');
  assert.equal(problem, undefined);
  const [process] = root.rootElements;
  assert.deepEqual([process.kind, process.flowElements.find(e => e.id === 'build').timeout], ['deploy', 10]);
  assert.equal(await workflowProblem(source, 'deploy'), null);
});

test('what the dialect does not have is said: not BPMN, an attribute or element of Coda\'s it does not know, an action or a parameter', async () => {
  assert.match(await workflowProblem('<definitions', 'w'), /^w\.bpmn 不是有效的 BPMN 2\.0：/);
  assert.equal(await workflowProblem('x'.repeat(1_000_001), 'w'), 'w.bpmn 过大');
  assert.match(await workflowProblem(workflow('<startEvent id="s" />', ' coda:knd="deploy"'), 'w'), /^w\.bpmn 有无法识别的内容：unknown attribute <coda:knd>/);
  assert.match(await workflowProblem(workflow('<scriptTask id="s"><extensionElements><coda:envv name="A" /></extensionElements></scriptTask>'), 'w'),
    /^w\.bpmn 有无法识别的内容：unparsable content <coda:envv>[\s\S]*unknown type <coda:Envv>/);
  // In a subprocess as at the top.
  assert.match(await workflowProblem(workflow('<subProcess id="sub"><serviceTask id="go" coda:action="deploy-all" /></subProcess>'), 'w'),
    /^go：coda:action 只能是 publish-stage、/);
  // A name an object has of its own kind is no action either, with a parameter or without.
  assert.match(await workflowProblem(workflow('<serviceTask id="go" coda:action="constructor" />'), 'w'), /^go：coda:action 只能是 /);
  assert.match(await workflowProblem(workflow('<serviceTask id="go" coda:action="toString"><extensionElements><coda:param name="x" value="1" /></extensionElements></serviceTask>'), 'w'),
    /^go：coda:action 只能是 /);
  assert.equal(await workflowProblem(workflow('<serviceTask id="go" coda:action="run-workflows"><extensionElements><coda:param name="branch" value="main" /></extensionElements></serviceTask>'), 'w'),
    'go：coda:action run-workflows 只接受参数 kind、commit、inputs');
});

test('the names workflows share are the dialect\'s: the kinds, those that deploy among them, and the events Coda sends', () => {
  assert.deepEqual(WORKFLOW_KINDS, ['deploy', 'preview', 'release', 'check', 'premerge']);
  assert.ok(DEPLOYING_KINDS.every(kind => WORKFLOW_KINDS.includes(kind)));
  assert.deepEqual(CODA_EVENTS, [SESSION_OPENED, SESSION_FACTS, DISPATCH_EVENT, CANCEL_EVENT]);
  assert.deepEqual(CODA_ACTIONS['hold-group'], ['group', 'capacity', 'borrow', 'exclusive']);
});
