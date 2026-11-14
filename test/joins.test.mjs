// Hooks: a workflow says which hooks it joins (coda:join) and whether it runs only merged commits (coda:mergedOnly); the
// hosts find the joiners of a hook (hook-joiners) and run them, all or those chosen (run-workflows hook, only).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODA_ACTIONS, CODA_MODDLE, joinInputNames, readWorkflow, workflowProblem } from '../workflow.mjs';

// A runnable process with `head` in its extensionElements and `attributes` on it.
const process = (head, attributes = '', body = '<startEvent id="s" /><sequenceFlow id="f" sourceRef="s" targetRef="t" /><userTask id="t" /><sequenceFlow id="g" sourceRef="t" targetRef="e" /><endEvent id="e" />') => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:coda="${CODA_MODDLE.uri}" targetNamespace="https://coda.pub/test">
  <process id="deploy" name="部署" isExecutable="true"${attributes}><extensionElements>${head}</extensionElements>${body}</process>
</definitions>`;

test('a workflow joins hooks with how it shows there, and says whether it runs only merged commits', async () => {
  const source = process(`<coda:join hook="after-merge" name="部署" detail="预览空间后端与 Coda β" default="false" order="10" />
    <coda:join hook="check" />`, ' coda:mergedOnly="true"');
  const { root, problem } = await readWorkflow(source, 'deploy');
  assert.equal(problem, undefined);
  const [definition] = root.rootElements;
  assert.equal(definition.mergedOnly, true);
  assert.deepEqual(definition.extensionElements.values.map(j => [j.$type, j.hook, j.name, j.detail, j.default, j.order]),
    [['coda:Join', 'after-merge', '部署', '预览空间后端与 Coda β', 'false', '10'], ['coda:Join', 'check', undefined, undefined, undefined, undefined]]);
  for (const order of ['0', '-5', '999999']) assert.equal(await workflowProblem(process(`<coda:join hook="h" order="${order}" />`), 'w'), null, order);
  assert.equal((await readWorkflow(process('', ' coda:mergedOnly="false"'), 'w')).root.rootElements[0].mergedOnly, false);
  // Spelled exactly: anything else would quietly read as false and run commits not merged.
  for (const value of ['tru', 'TRUE', 'no', '1', '', '=inputs.merged'])
    assert.equal(await workflowProblem(process('', ` coda:mergedOnly="${value}"`), 'w'), 'deploy：coda:mergedOnly 只能是 true 或 false', value);
});

test('what a join may not be is said: no hook, a hook not a name, the same hook twice, a default read in a run, an order not a number', async () => {
  const cases = [
    ['<coda:join name="部署" />', /^deploy 的 coda:join 部署 需要 hook：coda:join 需要 hook$/],
    ['<coda:join hook="After_Merge" />', /^deploy 的 coda:join After_Merge：hook 须为小写字母开头的小写字母、数字、「-」/],
    ['<coda:join hook="after-merge" /><coda:join hook="after-merge" name="又一次" />', /^deploy：coda:join 的 hook 不能重复|hook 不能重复：after-merge/],
    ['<coda:join hook="h" name=" " />', /^deploy 的 coda:join h：name 须为 1–40 个字$/],
    ['<coda:join hook="h" detail="' + '字'.repeat(201) + '" />', /^deploy 的 coda:join h：detail 不超过 200 字$/],
    ['<coda:join hook="h" default="=inputs.on" />', /^deploy 的 coda:join h：default 只能是 true 或 false/],
    ['<coda:join hook="h" order="1.5" />', /^deploy 的 coda:join h：order 须为整数/],
    ['<coda:join hook="h" when="always" />', /有无法识别的内容：unknown attribute <when>/],
  ];
  for (const [head, said] of cases) assert.match(await workflowProblem(process(head), 'w'), said, head);
});

test('the hosts\' actions: hook-joiners takes a hook and a commit, run-workflows a hook and the ones chosen', async () => {
  assert.deepEqual(CODA_ACTIONS['hook-joiners'], ['hook', 'commit']);
  assert.deepEqual(CODA_ACTIONS['run-workflows'], ['hook', 'only', 'commit', 'inputs']);
  const body = `<startEvent id="s" /><sequenceFlow id="a" sourceRef="s" targetRef="joiners" />
    <serviceTask id="joiners" coda:action="hook-joiners"><extensionElements><coda:param name="hook" value="after-merge" /></extensionElements></serviceTask>
    <sequenceFlow id="b" sourceRef="joiners" targetRef="ask" />
    <userTask id="ask" coda:assignee="user"><extensionElements><coda:choice id="merge" name="合并" primary="true"><coda:optionList value="=joiners.list" /></coda:choice></extensionElements></userTask>
    <sequenceFlow id="c" sourceRef="ask" targetRef="go" />
    <serviceTask id="go" coda:action="run-workflows"><extensionElements><coda:param name="hook" value="after-merge" />
      <coda:param name="only" value="=get entries(ask.options)[value].key" /></extensionElements></serviceTask>
    <sequenceFlow id="d" sourceRef="go" targetRef="e" /><endEvent id="e" />`;
  assert.equal(await workflowProblem(process('', '', body), 'host'), null);
  assert.equal(await workflowProblem(process('', '', body.replace('name="hook" value="after-merge" />', 'name="hooks" value="after-merge" />')), 'host'),
    'joiners：coda:action hook-joiners 只接受参数 hook、commit');
});

test('a join asks the card for its own text inputs, each once', async () => {
  const inputs = '<coda:input name="notes" label="发布说明" /><coda:input name="title" type="string" /><coda:input name="publish" type="boolean" default="false" />';
  const { root, problem } = await readWorkflow(process(`${inputs}<coda:join hook="merged" name="发布预览版" inputs="notes, title" />`), 'deploy');
  assert.equal(problem, undefined);
  const join = root.rootElements[0].extensionElements.values.find(v => v.$type === 'coda:Join');
  assert.deepEqual(joinInputNames(join), ['notes', 'title']);
  assert.deepEqual(joinInputNames({}), []);
  for (const written of ['notes', ' notes title ', 'notes,title']) assert.equal(await workflowProblem(process(`${inputs}<coda:join hook="h" inputs="${written}" />`), 'w'), null, written);
  const cases = [
    ['inputs="missing"', /^deploy 的 coda:join h：inputs 里的 missing 不是这个流程的文字参数（type 为 string 的 coda:input）$/],
    ['inputs="publish"', /^deploy 的 coda:join h：inputs 里的 publish 不是这个流程的文字参数/],
    ['inputs="notes notes"', /^deploy 的 coda:join h：inputs 里 notes 重复$/],
    ['inputs="notes;title"', /^deploy 的 coda:join h：inputs 须为这个流程的参数名，逗号或空格分隔，最多 4 个$/],
    ['inputs="a b c d e"', /^deploy 的 coda:join h：inputs 须为这个流程的参数名/],
  ];
  for (const [attribute, said] of cases) assert.match(await workflowProblem(process(`${inputs}<coda:join hook="h" ${attribute} />`), 'w'), said, attribute);
});

test('what a join asks of the card is what an option on the card may bring: an id of at most 64, a label of at most 40', async () => {
  const join = '<coda:join hook="h" inputs="n" />';
  assert.equal(await workflowProblem(process(`<coda:input name="${'n'.repeat(40)}" />${join.replace('"n"', `"${'n'.repeat(40)}"`)}`), 'w'), null);
  assert.equal(await workflowProblem(process(`<coda:input name="${'n'.repeat(64)}" label="说明" />${join.replace('"n"', `"${'n'.repeat(64)}"`)}`), 'w'), null);
  // No label: the name shows, and must fit as one.
  assert.equal(await workflowProblem(process(`<coda:input name="${'n'.repeat(41)}" />${join.replace('"n"', `"${'n'.repeat(41)}"`)}`), 'w'),
    `deploy 的 coda:join h：inputs 里的 ${'n'.repeat(41)} 上卡片时输入的 label 须为 1–40 个字（没写 label 时用参数名）`);
  assert.equal(await workflowProblem(process(`<coda:input name="${'n'.repeat(65)}" label="说明" />${join.replace('"n"', `"${'n'.repeat(65)}"`)}`), 'w'),
    `deploy 的 coda:join h：inputs 里的 ${'n'.repeat(65)} 上卡片时输入的 id 须为字母开头的字母、数字、「_」`);
});
