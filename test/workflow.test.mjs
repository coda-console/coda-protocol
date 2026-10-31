// Reading a workflow with Coda's dialect: one written in it is read, and each kind of thing the dialect does not have is
// said, one at a time.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CANCEL_EVENT, CODA_ACTIONS, CODA_EVENTS, CODA_MODDLE, CODA_VALUES, DEPLOYING_KINDS, DISPATCH_EVENT, feelProblem, INPUT_SOURCES, INPUT_TYPES, isDuration,
  readWorkflow, SESSION_FACTS, SESSION_OPENED, WORKFLOW_KINDS, workflowProblem } from '../workflow.mjs';

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
  // However deep it is nested.
  let nested = '<serviceTask id="deep" coda:action="nope" />';
  for (let i = 5000; i > 0; i--) nested = `<subProcess id="s${i}">${nested}</subProcess>`;
  assert.match(await workflowProblem(workflow(nested), 'w'), /^deep：coda:action 只能是 /);
  // And however many there are in one place.
  assert.match(await workflowProblem(workflow(`${'<task/>'.repeat(140_000)}<serviceTask id="wide" coda:action="nope" />`), 'w'), /^wide：coda:action 只能是 /);
  assert.equal(await workflowProblem(workflow('<serviceTask id="go" coda:action="run-workflows"><extensionElements><coda:param name="branch" value="main" /></extensionElements></serviceTask>'), 'w'),
    'go：coda:action run-workflows 只接受参数 kind、commit、inputs');
});

test('the names workflows share are the dialect\'s: the kinds, those that deploy among them, and the events Coda sends', () => {
  assert.deepEqual(WORKFLOW_KINDS, ['deploy', 'preview', 'release', 'check', 'premerge']);
  assert.ok(DEPLOYING_KINDS.every(kind => WORKFLOW_KINDS.includes(kind)));
  assert.deepEqual(CODA_EVENTS, [SESSION_OPENED, SESSION_FACTS, DISPATCH_EVENT, CANCEL_EVENT]);
  assert.deepEqual(CODA_ACTIONS['hold-group'], ['group', 'capacity', 'borrow', 'exclusive']);
});

// Each coda: value is checked against its schema (values.json), and what is wrong is said where it is, as Coda says it.
test('a coda: value its schema does not take is said where it is: an attribute, a coda: element, the elements of one kind together', async () => {
  const step = (attrs, inside = '') => workflow(`<scriptTask id="say" scriptFormat="bash"${attrs}>${inside ? `<extensionElements>${inside}</extensionElements>` : ''}<script>echo</script></scriptTask>`);
  const task = inside => workflow(`<userTask id="ask"><extensionElements>${inside}</extensionElements></userTask>`);
  const cases = [
    [workflow('', ' coda:kind="deploys"'), /^p：coda:kind 只能是 deploy、preview、release、check、premerge$/],
    [workflow('', ` coda:title="${'长'.repeat(201)}"`), /^p：coda:title 须为 1–200 个字符$/],
    [workflow('', ' coda:agents=",,"'), /^p：coda:agents 写 Agent 的 ID/],
    [step(' coda:retry="9"'), /^say：coda:retry 是失败后最多再试几次，须为 1 到 5 的整数$/],
    [step(' coda:timeout="0"'), /^say：coda:timeout 须为 0–1440 之间的分钟数$/],
    [step(' coda:checkout="no"'), /^say：coda:checkout 只能是 true 或 false$/],
    [step(' coda:runsOn="Linux"'), /^say：coda:runsOn 写逗号分隔的标签/],
    [step(' coda:status="{{ 1 + }}"'), /^say 的 coda:status：「1 \+」不是有效的 FEEL 表达式/],
    [step('', '<coda:env name="A" />'), /^say 的 coda:env A 需要 value$/],
    [step('', '<coda:env name="A" value="${{ inputs.a }}" />'), /^say 的 coda:env A：value 不超过 20000 字；这里的表达式以「=」开头/],
    [step('', '<coda:output name="bad-name" />'), /^say 的 coda:output bad-name：名字不合法/],
    [workflow('<extensionElements><coda:input name="a" /><coda:input name="a" /></extensionElements>'), /^p：name 不能重复：a$/],
    [workflow('<extensionElements><coda:input name="n" type="number" default="many" /></extensionElements>'), /^p 的 coda:input n：default 须为数字/],
    // A number that reads as more than a number holds is none.
    ...['1e999', '-1e999', '9'.repeat(400)].map(huge =>
      [workflow(`<extensionElements><coda:input name="n" type="number" default="${huge}" /></extensionElements>`), /^p 的 coda:input n：default 须为数字/]),
    [workflow('<extensionElements><coda:input name="b" type="boolean" defaultFrom="session.branch" /></extensionElements>'), /^p 的 coda:input b：defaultFrom="session\.branch" 只用于 type 为 branch、string 的参数$/],
    [task('<coda:choice id="handback" name="交回" />'), /^ask 的 coda:choice handback：id 须为字母开头/],
    [task('<coda:choice id="a" name="甲" primary="true" /><coda:choice id="b" name="乙" primary="true" />'), /^ask：最多 6 个 coda:choice，最多一个主按钮；/],
    [task('<coda:choice id="a" name="甲"><coda:choice id="b" name="乙" primary="true" /></coda:choice>'), /^ask 的 coda:choice b：只有最外层的选项能是主按钮$/],
    // Answers are told apart by id across the task: one inside another, or inside two others, is not to have one twice.
    [task('<coda:choice id="yes" name="是"><coda:choice id="yes" name="也是" /></coda:choice>'), /^ask：id 不能重复：yes$/],
    [task('<coda:choice id="a" name="甲"><coda:choice id="same" name="一" /></coda:choice><coda:choice id="b" name="乙"><coda:choice id="same" name="二" /></coda:choice>'),
      /^ask：id 不能重复：same$/],
    [task('<coda:choice id="a" name="甲"><coda:option id="o" name="部署" shown="true" /></coda:choice>'), /^ask 的 coda:option o：coda:shown 须为表达式（以 = 开头）$/],
    [workflow('<userTask id="ask" coda:assignee="me" />'), /^ask：coda:assignee 只能是 agent/],
    [workflow('<startEvent id="due" coda:reportOn="always"><timerEventDefinition><timeCycle>R/PT6H</timeCycle></timerEventDefinition></startEvent>'),
      /^due 需要 coda:reportTo：写了 coda:reportOn 就要写 coda:reportTo（结果交给谁）$/],
    [workflow('<subProcess id="sub" coda:expect="soon" />'), /^sub：coda:expect 须为 ISO 8601 时长，如 PT1H，或读出时长的表达式$/],
    [workflow('<task id="each"><multiInstanceLoopCharacteristics coda:inputCollection="inputs.items" coda:inputElement="item" /></task>'),
      /^each：coda:inputCollection 须为「=」开头的 FEEL 表达式/],
    [workflow('<task id="each"><multiInstanceLoopCharacteristics coda:inputCollection="=inputs.items" /></task>'), /^each 需要 coda:inputElement：写 coda:inputElement/],
  ];
  for (const [source, said] of cases) assert.match(await workflowProblem(source, 'w'), said, source);
  // Any number that is one: however large, small or precise.
  for (const number of ['-1.5e99', '1e100', '1e-100', `0.${'3'.repeat(40)}`, '1e308'])
    assert.equal(await workflowProblem(workflow(`<extensionElements><coda:input name="n" type="number" default="${number}" /></extensionElements>`), 'w'), null, number);
  // What it reads by name is the workflow's: a node's id with a dash reads as one name.
  assert.equal(await workflowProblem(step(' coda:status="还在：{{in-queue.count}}"').replace('<scriptTask id="say"', '<task id="in-queue" /><scriptTask id="say"'), 'w'), null);
});

test('FEEL and durations are read as Coda reads them, and the schemas say the names the dialect has', () => {
  assert.equal(feelProblem('=review.verdict = "APPROVE"'), null);
  assert.equal(feelProblem('还在验证：{{verifying.what}}'), null);
  assert.equal(feelProblem('= '), '表达式是空的');
  assert.match(feelProblem('${environment.vars.x}'), /^表达式改用 FEEL/);
  assert.match(feelProblem('=in-queue.count'), /不是有效的 FEEL 表达式/);
  assert.equal(feelProblem('=in-queue.count', { 'in-queue': null }), null);
  assert.deepEqual([isDuration('PT1H'), isDuration('-PT1H'), isDuration('soon')], [true, false, false]);
  const defs = CODA_VALUES.$defs;
  assert.deepEqual(defs.ProcessProperties.properties.kind.enum, WORKFLOW_KINDS);
  assert.deepEqual(defs.Input.properties.type.enum, INPUT_TYPES);
  assert.deepEqual(defs.Input.properties.defaultFrom.enum, Object.keys(INPUT_SOURCES));
  assert.deepEqual(defs.Input.allOf[0].then.properties.type.enum, INPUT_SOURCES['session.branch'].types);
  for (const name of Object.keys(defs).filter(name => !name.endsWith('.children') && name !== 'NestedChoice'))
    assert.ok(CODA_MODDLE.types.some(type => type.name === name), `values.json 的 ${name} 是 moddle.json 的一个类型`);
});
