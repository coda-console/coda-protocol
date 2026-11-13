// An answer's options read from a list (coda:optionList): written among coda:option in the order they show, checked in
// the definition as an expression, and the opened list (static ones resolved, each list put where it is written) checked
// with the same rules as the static ones.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODA_MODDLE, optionsProblem, readWorkflow, workflowProblem } from '../workflow.mjs';

// A user task `ask` whose one answer holds `options`.
const asking = options => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:coda="${CODA_MODDLE.uri}" targetNamespace="https://coda.pub/test">
  <process id="p" isExecutable="true">
    <startEvent id="start" /><sequenceFlow id="in" sourceRef="start" targetRef="ask" />
    <userTask id="ask" coda:assignee="user"><extensionElements><coda:choice id="merge" name="合并" primary="true">${options}</coda:choice></extensionElements></userTask>
    <sequenceFlow id="out" sourceRef="ask" targetRef="end" /><endEvent id="end" />
  </process>
</definitions>`;

test('coda:optionList is read among coda:option, in the order written', async () => {
  const source = asking('<coda:option id="first" name="先" /><coda:optionList value="=ask.lists" /><coda:option id="last" name="后" default="true" />');
  const { root, problem } = await readWorkflow(source, 'w');
  assert.equal(problem, undefined);
  const choice = root.rootElements[0].flowElements.find(e => e.id === 'ask').extensionElements.values[0];
  assert.deepEqual(choice.options.map(o => [o.$type, o.id ?? o.value]), [['coda:Option', 'first'], ['coda:OptionList', '=ask.lists'], ['coda:Option', 'last']]);
  assert.equal(await workflowProblem(asking('<coda:optionList value="=[]" /><coda:optionList value="=[]" />'), 'w'), null);
});

test('a coda:optionList is an expression, only in an answer holding no others; there is no other way to write one', async () => {
  const cases = [
    ['<coda:optionList />', /^ask 的 coda:optionList 需要 value：coda:optionList 须用 value 写一个「=」开头的表达式（勾选项的列表）$/],
    ['<coda:optionList value="deploy" />', /^ask 的 coda:optionList：coda:optionList 须用 value 写一个「=」开头的表达式（勾选项的列表）$/],
    ['<coda:choice id="inner" name="内"><coda:optionList value="=[]" /></coda:choice>', /^ask 的 coda:choice inner：勾选项（coda:option、coda:optionList）只能属于没有嵌套 choice 的外层 choice$/],
    ['<coda:choice id="inner" name="内" /><coda:optionList value="=[]" />', /^ask 的 coda:choice merge：勾选项（coda:option、coda:optionList）只能属于没有嵌套 choice 的外层 choice$/],
    // Its name is not the plural of coda:option: that is the answer's own list of them.
    ['<coda:options value="=[]" />', /^w\.bpmn 有无法识别的内容：unknown attribute <value>/],
    ['<coda:choiceOption />', /^ask 的 coda:choiceOption：勾选项写 coda:option，一组读出来的勾选项写 coda:optionList$/],
    // The definition counts what it holds, a list as one; the opened list is counted again (below).
    [Array.from({ length: 13 }, () => '<coda:optionList value="=[]" />').join(''), /^ask 的 coda:choice merge：最多 12 个勾选项$/],
  ];
  for (const [options, said] of cases) assert.match(await workflowProblem(asking(options), 'w'), said, options);
});

test('an opened list of options: objects of id, name, detail and a boolean default, at most 12, ids unique', () => {
  const at = 'approve 的答复 merge';
  assert.equal(optionsProblem([], at), null);
  assert.equal(optionsProblem([{ id: 'deploy', name: '部署', detail: '预览空间后端', default: false }, { id: 'notify', name: '全部完成后通知 Agent', default: true }], at), null);
  assert.equal(optionsProblem(Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, name: `第 ${i} 项` })), at), null);
  const cases = [
    ['deploy', `${at}：勾选项须为数组`],
    [null, `${at}：勾选项须为数组`],
    [{ id: 'deploy', name: '部署' }, `${at}：勾选项须为数组`],
    [Array.from({ length: 13 }, (_, i) => ({ id: `o${i}`, name: 'x' })), `${at}：最多 12 个勾选项`],
    [[1], `${at} 的勾选项 1：勾选项须为对象，有 id 与 name，可有 detail 与 default`],
    [[{ id: 'deploy' }], `${at} 的勾选项 deploy：勾选项须为对象，有 id 与 name，可有 detail 与 default`],
    [[{ id: '1st', name: '先' }], `${at} 的勾选项 1st：id 须为字母开头的字母、数字、「_」「-」`],
    [[{ id: 'a', name: ' ' }], `${at} 的勾选项 a：name 须为 1–40 个字`],
    [[{ id: 'a', name: '字'.repeat(41) }], `${at} 的勾选项 a：name 须为 1–40 个字`],
    [[{ id: 'a', name: 'A', detail: '字'.repeat(201) }], `${at} 的勾选项 a：detail 不超过 200 字`],
    [[{ id: 'a', name: 'A', default: 'true' }], `${at} 的勾选项 a：default 须为 true 或 false`],
    // What decides whether one shows is the list itself: an opened option has no coda:shown.
    [[{ id: 'a', name: 'A', shown: '=true' }], `${at} 的勾选项 a：勾选项须为对象，有 id 与 name，可有 detail 与 default`],
    [[{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'a', name: 'A2' }], `${at}：勾选项的 id 不能重复：a`],
  ];
  for (const [list, said] of cases) assert.equal(optionsProblem(list, at), said, JSON.stringify(list));
});
