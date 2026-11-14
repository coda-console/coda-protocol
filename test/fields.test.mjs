// The same schema checks field declarations and resolved values. Definitions defer content, never ids, types or flags.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODA_FIELDS, CODA_MODDLE, fieldProblem, fieldsProblem, readWorkflow, workflowProblem } from '../workflow.mjs';

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('\r', '&#13;').replaceAll('\n', '&#10;');
const fieldXML = field => `<coda:field ${Object.entries(field).map(([key, value]) => `${key}="${esc(typeof value === 'object' ? JSON.stringify(value) : value)}"`).join(' ')}/>`;
const workflow = body => `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:coda="${CODA_MODDLE.uri}" targetNamespace="test">
<process id="p" isExecutable="true"><startEvent id="start"/><sequenceFlow id="start-ask" sourceRef="start" targetRef="ask"/><task id="in-queue"/><userTask id="ask" coda:assignee="user"><extensionElements>${body}</extensionElements></userTask></process></definitions>`;
const text = { type: 'text', id: 'a', label: '名称' }, secret = { type: 'secret', id: 'a', label: '密码' };
const view = { type: 'view', label: '查看', plugin: 'remote', view: 'desktop' };
const machines = [{ id: '49057de5-4a09-465b-af32-2c3bc655bfab', label: '本机' }, { id: 'rig', label: 'rig', detail: '离线' }, { id: 'phone', label: 'xiaomi', detail: '没有装这个插件', disabled: true }];
const choices = { type: 'choices', id: 'machines', label: '写到', options: machines };
const missing = (raw, key) => Object.fromEntries(Object.entries(raw).filter(([name]) => name !== key));
const idSaid = '须有 id（字母或数字开头的字母、数字、「_」「-」，最长 40 个字符）';
const typesSaid = '字段的 type 只能是 markdown、code、image、text、secret、link、view、choices';
const keepSaid = 'keep 只能是 session（写进会话的密钥目录，流程拿到路径）、memory（只在后端内存里，本会话的桌面动作可反复用，流程拿到句柄）或 use（只在后端内存里，流程拿到句柄，用一次）';
const cases = [
  [{}, typesSaid], [{ type: 'video' }, typesSaid],
  [missing(text, 'id'), idSaid], [{ ...text, id: '_a' }, idSaid], [{ ...text, id: 'a'.repeat(41) }, idSaid],
  [{ ...text, id: '__proto__' }, idSaid], [{ type: 'markdown', id: 'bad.id', text: 'x' }, idSaid],
  [missing(text, 'label'), '须写 label'], [{ ...text, label: ' ' }, 'label 须为一行、1–40 个字'],
  [{ ...text, label: 'x\ny' }, 'label 须为一行、1–40 个字'], [{ ...text, label: 'x'.repeat(41) }, 'label 须为一行、1–40 个字'],
  [{ type: 'markdown' }, '须写 text'], [{ type: 'markdown', text: ' ' }, 'text 须为1–4000 个字'],
  [{ type: 'markdown', text: 'x'.repeat(4001) }, 'text 须为1–4000 个字'],
  [{ type: 'code' }, '须写 text'], [{ type: 'code', text: 'x'.repeat(16385) }, 'text 须为1–16384 个字'],
  [{ type: 'image' }, '须写 src'], [{ type: 'image', src: 'shot.png' }, 'src 须为本机文件的绝对路径'],
  [{ type: 'image', src: '/x\ny' }, 'src 须为一行、1–4096 个字'],
  [{ type: 'image', src: '/'.repeat(4097) }, 'src 须为一行、1–4096 个字'],
  [{ type: 'link', href: 'https://example.com' }, '须写 label'], [{ type: 'link', label: 'L' }, '须写 href'],
  [{ type: 'link', label: 'L', href: 'http://example.com' }, 'href 须为 https 网址或 iOS 安装链接（itms-services，清单为 https）'],
  [{ type: 'link', label: 'L', href: 'https://[' }, 'href 须为 https 网址或 iOS 安装链接（itms-services，清单为 https）'],
  ...[
    'javascript:alert(1)',
    'itms-services://?action=other&url=https://example.com/manifest.plist',
    'itms-services://?url=https://example.com/manifest.plist',
    'itms-services://?action=download-manifest',
    'itms-services://?action=download-manifest&url=',
    'itms-services://?action=download-manifest&url=http%3A%2F%2Fexample.com%2Fmanifest.plist',
    'itms-services://?action=download-manifest&url=https%3A%2F%2F%5B',
  ].map(href => [{ type: 'link', label: 'L', href }, 'href 须为 https 网址或 iOS 安装链接（itms-services，清单为 https）']),
  [{ type: 'link', label: 'L', href: 'https://example.com/' + 'x'.repeat(2000) }, 'href 须为一行、1–2000 个字'],
  [missing(view, 'label'), '须写 label'], [missing(view, 'plugin'), '须写 plugin'], [missing(view, 'view'), '须写 view'],
  [{ ...view, plugin: 'Remote' }, 'plugin 须为插件 ID（小写字母、数字和「-」）'],
  [{ ...view, plugin: 'a'.repeat(65) }, 'plugin 须为一行、1–64 个字'],
  [{ ...view, view: 'Desktop' }, 'view 须为插件声明的视图 ID（小写字母开头的小写字母、数字和「-」）'],
  [{ ...view, view: 'a'.repeat(41) }, 'view 须为一行、1–40 个字'],
  [{ ...view, presentation: 'unknown' }, 'presentation 只能是 window、inline 或 side'],
  [{ ...view, args: 'broken' }, 'args 须为 JSON 对象'],
  ...['[]', 'null', '"x"', '42'].map(args => [{ ...view, args }, 'args 须为不超过 4096 字节的 JSON 对象']),
  [{ ...view, args: { x: '界'.repeat(1400) } }, 'args 须为不超过 4096 字节的 JSON 对象'],
  [{ ...text, required: 'false' }, 'required 须为 true 或 false', false],
  [{ ...text, required: 'no' }, 'required 须为 true 或 false'],
  [{ ...text, multiline: 'no' }, 'multiline 须为 true 或 false'],
  [{ ...secret, masked: 'no' }, 'masked 须为 true 或 false'],
  ...[0, -1, 1.5, 4001, '1x', '1e2'].map(maxLength => [{ ...text, maxLength }, 'maxLength 须为 1–4000 的整数']),
  [{ ...secret, maxLength: 65537 }, 'maxLength 须为 1–65536 的整数'],
  [{ ...text, autofill: 'password' }, 'autofill 只能是 username、otp'],
  [{ ...secret, autofill: 'email' }, 'autofill 只能是 username、password、otp'],
  [{ ...text, default: ' ' }, 'default 须为一行、1–200 个字'],
  [{ ...text, default: 'a\nb' }, 'default 须为一行、1–200 个字'],
  [{ ...text, default: 'x'.repeat(201) }, 'default 须为一行、1–200 个字'],
  [{ ...text, multiline: true, default: 'x'.repeat(4001) }, 'default 须为1–4000 个字'],
  [{ ...text, maxLength: 2, default: 'abc' }, 'default 须为一行、1–2 个字'],
  [{ ...text, maxLength: 2, default: ' ' }, 'default 须为一行、1–2 个字'],
  [{ ...text, maxLength: 2, default: 'a\nb' }, 'default 须为一行、1–2 个字'],
  [{ ...text, maxLength: 2, default: false }, 'default 须为一行、1–2 个字'],
  [{ ...text, maxLength: 2, multiline: true, default: 'abc' }, 'default 须为1–2 个字'],
  [{ ...secret, keep: 'file' }, keepSaid],
  [{ ...secret, host: 'localhost' }, 'host 须为网站域名，如 signin.aws.amazon.com'],
  [{ ...secret, host: ' a.b ' }, 'host 须为网站域名，如 signin.aws.amazon.com'],
  [{ ...secret, host: '-x.example.com' }, 'host 须为网站域名，如 signin.aws.amazon.com'],
  [{ ...secret, host: 'x'.repeat(254) }, 'host 须为一行、1–253 个字'],
  [{ ...secret, dir: '../a' }, 'dir 只能是字母、数字、点、下划线和连字符，以字母或数字开头，最长 80 个字符'],
  [{ ...secret, dir: 'a'.repeat(81) }, 'dir 须为一行、1–80 个字'],
  [{ ...secret, keep: 'use', dir: 'd' }, 'dir 只用于 keep="session" 或 keep="memory" 的密文'],
  [{ ...secret, default: 'x' }, 'secret 字段没有 default，可写 type、id、label、required、maxLength、multiline、masked、autofill、keep、host、dir'],
  [{ ...view, text: 'x' }, 'view 字段没有 text，可写 type、id、label、plugin、view、args、presentation'],
];
for (const [index, [field, description, xml = true]] of cases.entries()) test(`field rule ${index + 1}: ${description}`, async () => {
  assert.equal(fieldProblem(field, 'ask'), `ask：${description}`);
  if (xml) assert.equal(await workflowProblem(workflow(fieldXML(field))), `ask 的 coda:field${field.id ? ` ${field.id}` : ''}：${description}`);
});

test('runtime field validation rejects non-JSON values without throwing, including non-finite numbers and deep/wide args', () => {
  for (const value of [null, false, 'x', 42, []]) assert.equal(fieldProblem(value, 'ask'), 'ask：字段须为对象');
  for (const maxLength of [NaN, Infinity, -Infinity]) assert.equal(fieldProblem({ ...text, maxLength }), '字段：maxLength 须为 1–4000 的整数');
  for (const [key, value, expected] of [['label', 42, 'label 须为一行、1–40 个字'], ['id', 42, idSaid], ['type', {}, typesSaid]])
    assert.equal(fieldProblem({ ...text, [key]: value }), `字段：${expected}`);
  let deep = {}, validDeep = {};
  for (let i = 0; i < 20000; i++) deep = { a: deep };
  for (let i = 0; i < 400; i++) validDeep = { a: validDeep };
  const cycle = {}; cycle.self = cycle;
  for (const args of [deep, cycle, { x: Array(200000).fill(0) }, { x: Infinity }, { x: NaN }, { x: 1n }, '{"x":1e999}'])
    assert.equal(fieldProblem({ ...view, args }), '字段：args 须为不超过 4096 字节的 JSON 对象');
  assert.equal(fieldProblem({ ...view, args: validDeep }), null);
  assert.equal(fieldProblem({ ...view, args: '{"x":'.repeat(20000) + '0' + '}'.repeat(20000) }), '字段：args 须为不超过 4096 字节的 JSON 对象');
  const args = { x: 'a'.repeat(4088) };
  assert.equal(Buffer.byteLength(JSON.stringify(args)), 4096);
  assert.equal(fieldProblem({ ...view, args }), null);
  assert.equal(fieldProblem({ ...view, args: { x: args.x + 'a' } }), '字段：args 须为不超过 4096 字节的 JSON 对象');
  // The existing declaration limits count UTF-16 code units, including astral characters, unlike JSON Schema maxLength.
  assert.equal(fieldProblem({ ...text, label: '😀'.repeat(20) }), null);
  assert.equal(fieldProblem({ ...text, label: '😀'.repeat(21) }), '字段：label 须为一行、1–40 个字');
});

test('all field types, their optional properties, defaults and literal content are accepted without normalization', async () => {
  const good = [{ type: 'markdown', text: '正文\n第二行' }, { type: 'code', text: 'x'.repeat(16384), label: '代码' },
    { type: 'image', src: ' /tmp/shot.png\n' }, { type: 'link', label: '页面', href: ' https://example.com/a?q=1 ' },
    { type: 'link', label: '安装', href: 'itms-services://?action=download-manifest&url=https://example.com/manifest.plist' },
    { type: 'link', label: '安装', href: 'itms-services://?action=download-manifest&url=https%3A%2F%2Fexample.com%2Fmanifest.plist' },
    { ...view, plugin: ' remote ', view: ' desktop ', args: { title: '页面', values: [1, true, null] }, presentation: 'side' },
    { ...text, required: false, multiline: true, default: 'a\nb', maxLength: 4000, autofill: 'otp' },
    { ...secret, host: ' Signin.Example.com ', dir: 'site-login', keep: 'memory', autofill: 'password', masked: true, maxLength: 65536 }];
  for (const field of good) {
    const before = structuredClone(field);
    assert.equal(fieldProblem(field), null, JSON.stringify(field));
    assert.deepEqual(field, before);
    assert.equal(await workflowProblem(workflow(fieldXML(field))), null);
  }
  for (const presentation of ['window', 'inline', 'side']) assert.equal(fieldProblem({ ...view, presentation }), null);
  for (const keep of ['session', 'memory', 'use']) for (const autofill of ['username', 'password', 'otp'])
    assert.equal(fieldProblem({ ...secret, keep, autofill, masked: false, required: false, multiline: true }), null);
  for (const id of ['constructor', 'toString', 'valueOf', 'a-b_2', '0']) assert.equal(fieldProblem({ ...text, id }), null);
  assert.equal(fieldProblem({ type: 'markdown', text: '=not a FEEL expression' }), null);
  const raw = { ...text };
  assert.equal(fieldProblem(raw), null);
  assert.deepEqual(raw, text);
  assert.equal(CODA_FIELDS.$defs.secret.allOf[0].properties.keep.default, 'session');
  const { root } = await readWorkflow(workflow(fieldXML({ ...text, required: false, maxLength: 2 })));
  const parsed = root.rootElements[0].flowElements.find(e => e.id === 'ask').extensionElements.values[0];
  assert.equal(parsed.required, false);
  assert.equal(parsed.maxLength, 2);
});

test('definitions defer only content and check FEEL with workflow names; runtime validates resolved values', async () => {
  const deferred = [{ ...text, label: '=in-queue.longLabel', default: '=inputs.default' },
    { type: 'markdown', text: '{{ inputs.text }}'.repeat(400) }, { type: 'code', text: '=inputs.code' },
    { type: 'image', src: '=inputs.path' }, { type: 'link', label: 'L', href: '{{ inputs.url }}' },
    { ...view, plugin: '=inputs.plugin', view: '{{ inputs.view }}', args: '=inputs.args' },
    { ...secret, host: '=inputs.host', dir: '{{ inputs.dir }}' }];
  for (const field of deferred) assert.equal(await workflowProblem(workflow(fieldXML(field))), null);
  assert.equal(fieldProblem(deferred[4]), '字段：href 须为 https 网址或 iOS 安装链接（itms-services，清单为 https）');
  assert.equal(fieldProblem(deferred[5]), '字段：plugin 须为插件 ID（小写字母、数字和「-」）');
  for (const key of ['label', 'default']) assert.match(await workflowProblem(workflow(fieldXML({ ...text, [key]: '=1 +' }))), /^ask 的 coda:field a：「1 \+」不是有效的 FEEL 表达式/);
  for (const [field, key] of [[view, 'args'], [view, 'view'], [view, 'plugin'], [secret, 'host'], [secret, 'dir'], [{ type: 'markdown' }, 'text'], [{ type: 'image' }, 'src'], [{ type: 'link', label: 'L' }, 'href']])
    assert.match(await workflowProblem(workflow(fieldXML({ ...field, [key]: '{{1 +}}' }))), /不是有效的 FEEL 表达式/);
  assert.match(await workflowProblem(workflow(fieldXML({ ...text, default: '${environment.vars.x}' }))), /表达式改用 FEEL/);
  for (const [field, key] of [[text, 'id'], [text, 'type'], [text, 'required'], [text, 'maxLength'], [text, 'multiline'], [text, 'autofill'], [secret, 'masked'], [secret, 'keep'], [view, 'presentation']])
    assert.ok(await workflowProblem(workflow(fieldXML({ ...field, [key]: '=inputs.x' }))));
});

test('coda:fields describes deferred JSON, including optional host/dir; expanded lists use the field schema', async () => {
  for (const attrs of ['value="=inputs.fields"', `value="${esc('=' + JSON.stringify(JSON.stringify([{ type: 'markdown', text: 'hello' }])))}"`, 'value="=in-queue.fields" host="=inputs.host" dir="{{ inputs.dir }}"'])
    assert.equal(await workflowProblem(workflow(`<coda:fields ${attrs}/>`)), null);
  for (const attrs of ['', 'value="[]"', 'value="{{inputs.fields}}"'])
    assert.equal(await workflowProblem(workflow(`<coda:fields ${attrs}/>`)), 'ask 的 coda:fields：coda:fields 须用 value 写一个「=」开头的表达式（字段的列表）');
  assert.match(await workflowProblem(workflow('<coda:fields value="=1 +"/>')), /不是有效的 FEEL 表达式/);
  // Fallbacks can be overridden, unused (no secret inputs), or empty. Validate only the resolved, merged fields.
  for (const attrs of ['host="localhost" dir="../bad"', 'host="" dir=""'])
    assert.equal(await workflowProblem(workflow(`<coda:fields value="=inputs.fields" ${attrs}/>`)), null);
  for (const attr of ['host', 'dir'])
    assert.match(await workflowProblem(workflow(`<coda:fields value="=inputs.fields" ${attr}="=1 +"/>`)), /不是有效的 FEEL 表达式/);
  assert.equal(fieldsProblem([{ ...secret, host: 'localhost' }], 'ask'), 'ask 的字段 a：host 须为网站域名，如 signin.aws.amazon.com');
  assert.equal(fieldsProblem([{ ...secret, dir: '../bad' }], 'ask'), 'ask 的字段 a：dir 只能是字母、数字、点、下划线和连字符，以字母或数字开头，最长 80 个字符');
  const expanded = JSON.parse('[{"type":"text","id":"constructor","label":"名字"},{"type":"secret","id":"password","label":"密码"}]');
  assert.equal(fieldsProblem(expanded, 'ask'), null);
  assert.equal(fieldsProblem([text, text], 'ask'), 'ask：字段 id 重复：a');
  assert.equal(fieldsProblem([{}, text], 'ask'), `ask 的字段 1：${typesSaid}`);
  assert.equal(fieldsProblem(Array(200000).fill(text), 'ask'), 'ask：最多 12 个字段');
});

test('task-wide rules count declarations, distinguish ids and resolve choice inputs only when all fields are known', async () => {
  const choice = (fields, nested = false) => nested ? `<coda:choice id="outer" name="外层"><coda:choice id="go" name="好" fields="${fields}"/></coda:choice>` : `<coda:choice id="go" name="好" fields="${fields}"/>`;
  assert.equal(await workflowProblem(workflow(fieldXML(text).repeat(2))), 'ask：字段 id 重复：a');
  assert.equal(await workflowProblem(workflow(fieldXML({ ...text, id: 'constructor' }).repeat(2))), 'ask：字段 id 重复：constructor');
  assert.equal(await workflowProblem(workflow(fieldXML({ type: 'markdown', text: 'x' }).repeat(13))), 'ask：最多 12 个字段');
  assert.equal(await workflowProblem(workflow(fieldXML({ type: 'markdown', text: 'x' }).repeat(12))), null);
  for (const nested of [false, true]) {
    assert.equal(await workflowProblem(workflow(fieldXML(text) + choice('a, a', nested))), null);
    assert.equal(await workflowProblem(workflow(fieldXML({ ...text, id: 'constructor' }) + choice('constructor', nested))), null);
    for (const id of ['b', '__proto__', 'constructor'])
      assert.equal(await workflowProblem(workflow(fieldXML(text) + choice(id, nested))), `ask 的 coda:choice go：fields 里的 ${id} 不是这个任务的输入字段`);
    assert.equal(await workflowProblem(workflow(fieldXML({ type: 'markdown', id: 'a', text: 'x' }) + choice('a', nested))), 'ask 的 coda:choice go：fields 里的 a 不是这个任务的输入字段');
    assert.equal(await workflowProblem(workflow(choice('', nested))), null);
    assert.equal(await workflowProblem(workflow(choice('later', nested) + '<coda:fields value="=inputs.fields"/>')), null);
  }
});

test('each type allows only its declared attributes, including object-owned names supplied as extra keys', async () => {
  const examples = [{ type: 'markdown', text: 'x' }, { type: 'code', text: 'x' }, { type: 'image', src: '/tmp/x' },
    { ...text }, { ...secret }, { type: 'link', label: 'L', href: 'https://example.com' }, { ...view }, { ...choices }];
  const keys = new Set(examples.flatMap(field => Object.keys(CODA_FIELDS.$defs[field.type].allOf[0].properties)));
  for (const field of examples) {
    const allowed = CODA_FIELDS.$defs[field.type].allOf[0].properties;
    for (const key of keys) if (!Object.hasOwn(allowed, key)) {
      const description = `${field.type} 字段没有 ${key}，可写 ${Object.keys(allowed).join('、')}`;
      assert.equal(fieldProblem({ ...field, [key]: 'x' }, 'ask'), `ask：${description}`);
      assert.equal(await workflowProblem(workflow(fieldXML({ ...field, [key]: 'x' }))), `ask 的 coda:field${field.id ? ` ${field.id}` : ''}：${description}`);
    }
    for (const key of ['__proto__', 'constructor', 'toString'])
      assert.equal(fieldProblem({ ...field, [key]: 'x' }, 'ask'), `ask：${field.type} 字段没有 ${key}，可写 ${Object.keys(allowed).join('、')}`);
  }
});

test('runtime lists report type and item errors before inspecting ids; schema checks work in deeply nested BPMN', async () => {
  for (const value of [null, {}, '[]', false]) assert.equal(fieldsProblem(value, 'ask'), 'ask：coda:fields 须为字段的 JSON 数组');
  assert.equal(fieldsProblem([], 'ask'), null);
  assert.equal(fieldsProblem([null], 'ask'), 'ask 的字段 1：字段须为对象');
  let deep = {};
  for (let i = 0; i < 20000; i++) deep = { id: deep };
  assert.equal(fieldsProblem([{ ...text, id: deep }], 'ask'), `ask 的字段 1：${idSaid}`);
  let body = `<userTask id="deep"><extensionElements>${fieldXML({ ...text, maxLength: 0 })}</extensionElements></userTask>`;
  for (let i = 0; i < 5000; i++) body = `<subProcess id="s${i}">${body}</subProcess>`;
  assert.equal(await workflowProblem(workflow('').replace('<task id="in-queue"/>', body)), 'deep 的 coda:field a：maxLength 须为 1–4000 的整数');
});

// A choices field: options to tick (as a JSON array or its text, or an expression read as the task opens), the ids ticked
// at first (default, each one of the options' and not disabled), and whether one must be ticked (required).
const optionSaid = '选项须为对象，有 id 与 label，可有 detail 与 disabled';
const choicesCases = [
  [missing(choices, 'options'), '须写 options'], [missing(choices, 'id'), idSaid], [missing(choices, 'label'), '须写 label'],
  [{ ...choices, label: 'x'.repeat(41) }, 'label 须为一行、1–40 个字'],
  [{ ...choices, options: 'broken' }, 'options 须为选项的 JSON 数组'],
  ...['{}', '"x"', 'null', '42'].map(options => [{ ...choices, options }, 'options 须为选项的 JSON 数组']),
  [{ ...choices, options: [] }, 'options 须有 1–32 个选项'],
  [{ ...choices, options: Array.from({ length: 33 }, (_, i) => ({ id: `m${i}`, label: `第 ${i} 台` })) }, 'options 须有 1–32 个选项'],
  [{ ...choices, options: [null] }, optionSaid], [{ ...choices, options: ['a'] }, optionSaid],
  [{ ...choices, options: [{ id: 'a' }] }, optionSaid], [{ ...choices, options: [{ label: 'A' }] }, optionSaid],
  [{ ...choices, options: [{ id: 'a', label: 'A', name: 'A' }] }, optionSaid],
  ...['', ' a', 'a ', 'a\nb', 'x'.repeat(65)].map(id => [{ ...choices, options: [{ id, label: 'A' }] }, '选项的 id 须为一行、1–64 个字，前后不带空白']),
  [{ ...choices, options: [{ id: 1, label: 'A' }] }, '选项的 id 须为一行、1–64 个字，前后不带空白'],
  ...[' ', 'a\nb', 'x'.repeat(81)].map(label => [{ ...choices, options: [{ id: 'a', label }] }, '选项的 label 须为一行、1–80 个字']),
  ...['a\nb', 'x'.repeat(201), 42].map(detail => [{ ...choices, options: [{ id: 'a', label: 'A', detail }] }, '选项的 detail 须为一行、不超过 200 个字']),
  [{ ...choices, options: [{ id: 'a', label: 'A', disabled: 'true' }] }, '选项的 disabled 须为 true 或 false'],
  [{ ...choices, options: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }, 'options 里的 id 不能重复：a'],
  [{ ...choices, options: [{ id: 'a', label: 'A', disabled: true }] }, 'options 里至少要有一项能勾（不是 disabled）'],
  [{ ...choices, options: { x: '界'.repeat(30000) } }, 'options 须为不超过 65536 字节的 JSON 数组'],
  [{ ...choices, options: Array.from({ length: 32 }, (_, i) => ({ id: `m${i}`, label: '界'.repeat(80), detail: '界'.repeat(1000) })) }, 'options 须为不超过 65536 字节的 JSON 数组'],
  [{ ...choices, default: ['界'.repeat(3000)] }, 'default 须为不超过 8192 字节的 JSON 数组'],
  [{ ...choices, default: 'broken' }, 'default 须为选项 id 的 JSON 数组'],
  ...['"rig"', '{}', '[1]', '[null]'].map(value => [{ ...choices, default: value }, 'default 须为选项 id 的 JSON 数组']),
  [{ ...choices, default: ['rig', 'rig'] }, 'default 里的 id 不能重复'],
  [{ ...choices, default: ['rig', 'mac'] }, 'default 里的 mac 不在 options 里'],
  [{ ...choices, default: '["Rig"]' }, 'default 里的 Rig 不在 options 里'],
  [{ ...choices, default: ['phone'] }, 'default 里的 phone 是不能勾的选项（disabled）'],
  [{ ...choices, required: 'no' }, 'required 须为 true 或 false'],
  [{ ...choices, maxLength: 3 }, 'choices 字段没有 maxLength，可写 type、id、label、required、options、default'],
  [{ ...choices, multiline: true }, 'choices 字段没有 multiline，可写 type、id、label、required、options、default'],
];
for (const [index, [field, description]] of choicesCases.entries()) test(`choices rule ${index + 1}: ${description}`, async () => {
  assert.equal(fieldProblem(field, 'ask'), `ask：${description}`);
  assert.equal(await workflowProblem(workflow(fieldXML(field))), `ask 的 coda:field${field.id ? ` ${field.id}` : ''}：${description}`);
});

test('a choices field takes its options and default as JSON values or their text, and leaves them as they are', async () => {
  const good = [choices, { ...choices, required: false }, { ...choices, default: [] },
    { ...choices, default: ['rig', machines[0].id] }, { ...choices, options: JSON.stringify(machines), default: '["rig"]' },
    { ...choices, options: [{ id: 'only one', label: '  一台  ', detail: '' }] },
    { ...choices, options: Array.from({ length: 32 }, (_, i) => ({ id: `m${i}`, label: `第 ${i} 台`, detail: 'x'.repeat(200) })) },
    { ...choices, options: [{ id: 'x'.repeat(64), label: 'x'.repeat(80), disabled: false }], default: ['x'.repeat(64)] }];
  for (const field of good) {
    const before = structuredClone(field);
    assert.equal(fieldProblem(field), null, JSON.stringify(field));
    assert.deepEqual(field, before);
    assert.equal(await workflowProblem(workflow(fieldXML(field))), null, JSON.stringify(field));
  }
  // An id is matched exactly, as the answer gives it back.
  assert.equal(fieldProblem({ ...choices, options: [{ id: 'constructor', label: 'A' }, { id: '__proto__', label: 'B' }], default: ['__proto__'] }), null);
  assert.equal(fieldProblem({ ...choices, options: [{ id: 'a', label: 'A' }], default: ['constructor'] }), '字段：default 里的 constructor 不在 options 里');
  const { root } = await readWorkflow(workflow(fieldXML({ ...choices, required: false })));
  const parsed = root.rootElements[0].flowElements.find(e => e.id === 'ask').extensionElements.values[0];
  assert.equal(parsed.required, false);
  assert.equal(parsed.options, JSON.stringify(machines));
});

test('a choices field defers expressions until the task opens; one read later says nothing of the other', async () => {
  for (const field of [{ ...choices, options: '=in-queue.machines', default: '=in-queue.selected' }, { ...choices, options: '=in-queue.machines', default: '["not yet known"]' },
    { ...choices, default: '=in-queue.selected' }, { ...choices, options: '{{ in-queue.machines }}' }])
    assert.equal(await workflowProblem(workflow(fieldXML(field))), null, JSON.stringify(field));
  for (const key of ['options', 'default'])
    assert.match(await workflowProblem(workflow(fieldXML({ ...choices, [key]: '=1 +' }))), /^ask 的 coda:field machines：「1 \+」不是有效的 FEEL 表达式/);
  // At runtime the result is content: text that looks like an expression is not JSON.
  assert.equal(fieldProblem({ ...choices, options: '=in-queue.machines' }), '字段：options 须为选项的 JSON 数组');
  assert.equal(fieldProblem({ ...choices, default: '=in-queue.selected' }), '字段：default 须为选项 id 的 JSON 数组');
  // A default against options of the wrong shape is said by the options.
  assert.equal(fieldProblem({ ...choices, options: 'broken', default: ['rig'] }), '字段：options 须为选项的 JSON 数组');
  for (const key of ['id', 'type', 'required']) assert.ok(await workflowProblem(workflow(fieldXML({ ...choices, [key]: '=inputs.x' }))));
});

test('a choices field is an input: an answer may send it, the task is the user\'s, and expanded lists check it', async () => {
  const choice = fields => `<coda:choice id="apply" name="应用" primary="true" fields="${fields}"/>`;
  assert.equal(await workflowProblem(workflow(fieldXML(choices) + choice('machines'))), null);
  assert.equal(await workflowProblem(workflow(fieldXML(choices) + fieldXML(text) + choice('machines, a'))), null);
  assert.equal(await workflowProblem(workflow(fieldXML(choices) + choice('other'))), 'ask 的 coda:choice apply：fields 里的 other 不是这个任务的输入字段');
  assert.equal(fieldsProblem([choices, { ...text, id: 'note' }], 'ask'), null);
  assert.equal(fieldsProblem([choices, { ...choices, options: [] }], 'ask'), 'ask 的字段 machines：options 须有 1–32 个选项');
  assert.equal(fieldsProblem([choices, { ...text, id: 'machines' }], 'ask'), 'ask：字段 id 重复：machines');
});
