// The checker against manifests of every kind of mistake, one at a time: each is said where it is, in what the schema says
// there; its five keywords, each as it means the same thing wherever it is written; and an extension point's own schema.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { manifestProblem, pointProblem, SCHEMAS, TYPES, valueProblem } from '../validate.mjs';

const dirs = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
// A plugin's directory holding `files`.
function directory(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'coda-protocol-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) { mkdirSync(join(dir, name, '..'), { recursive: true }); writeFileSync(join(dir, name), content); }
  return dir;
}
const settings = { properties: { 'kit.size': { type: 'string' }, 'kit.count': { type: 'integer', default: 1 }, 'kit.key': { type: 'string', writeOnly: true } } };

test('the schemas are one of Coda\'s types each, beside the manifest\'s, a setting\'s and what they share', () => {
  assert.equal(TYPES.length, 22);
  for (const type of TYPES) assert.ok(SCHEMAS['plugin.json'].properties.contributes.properties[type].$ref.endsWith('.json'), type);
  assert.deepEqual(Object.keys(SCHEMAS).filter(file => !TYPES.some(type => SCHEMAS['plugin.json'].properties.contributes.properties[type].$ref === file)).sort(),
    ['common.json', 'plugin.json', 'setting.json']);
  for (const [file, schema] of Object.entries(SCHEMAS)) assert.equal(schema.$id, `https://coda.pub/schemas/plugin/v1/${file}`);
});

test('a manifest of the types it names is right; one key of no type, or of none Coda reads, is said where it is', () => {
  assert.equal(manifestProblem({ name: 'kit', contributes: { configuration: settings, instructions: '先读 README。', panels: [{ anything: 1 }] } }), null);
  assert.equal(manifestProblem({ name: 'kit', contributes: { 'my-panels': [] } }), 'contributes「my-panels」：contributes 的键：字母和数字，以小写字母开头');
  assert.equal(manifestProblem({ contributes: { composerModes: [{ id: 'go', title: '走', icon: 'bolt', colour: 'red' }] } }), 'contributes.composerModes[0] 里有不认识的键：colour');
  assert.equal(manifestProblem({ contributes: { composerModes: [{ id: 'go', icon: 'bolt' }] } }), 'contributes.composerModes[0] 缺 title');
  assert.match(manifestProblem({ contributes: { agents: {} } }), /^contributes\.agents 须为数组/);
  // A branch says what it is about when the value failing in it says nothing itself.
  assert.equal(manifestProblem({ contributes: { configuration: { properties: { 'kit.token': { type: 'integer', writeOnly: true } } } } }),
    'contributes.configuration.properties「kit.token」.type：密文设置（writeOnly）只能是没有 format、enum 与默认值的文本');
  assert.equal(manifestProblem({ contributes: { composerModes: [{ id: 'go', title: '走', icon: 'bolt', agent: 'own', in: ['new'] }] } }),
    'contributes.composerModes[0].in：开新会话的模式（agent: own）要从会话里发出，不能在 new 里');
});

test('x-unique-by: a property of an array\'s objects, or a part of its texts, once', () => {
  const mode = { id: 'go', title: '走', icon: 'bolt' };
  assert.equal(manifestProblem({ contributes: { composerModes: [mode, mode] } }), 'contributes.composerModes：id 不能重复：go');
  assert.equal(manifestProblem({ contributes: { composerModes: [{ ...mode, trigger: '!' }, { ...mode, id: 'run', trigger: '!' }] } }), 'contributes.composerModes：trigger 不能重复：!');
  const dir = directory({ 'a/review/SKILL.md': '', 'b/review/SKILL.md': '' });
  assert.equal(manifestProblem({ contributes: { skills: ['a/review', 'b/review/'] } }, dir), 'contributes.skills：不能重复：review');
  assert.equal(manifestProblem({ contributes: { skills: ['a/review'] } }, dir), null);
});

test('x-max-contains: at most so many of an object\'s values are such', () => {
  const url = { type: 'string', format: 'coda-model-url' };
  assert.equal(manifestProblem({ contributes: { configuration: { properties: { 'kit.url': url } } } }), null);
  assert.match(manifestProblem({ contributes: { configuration: { properties: { 'kit.url': url, 'kit.other': url } } } }), /至多一个模型地址/);
});

test('x-ref: a name of something elsewhere in the manifest, of the kind asked, by where it is from the root or from the value', () => {
  const groups = capacity => ({ contributes: { configuration: settings, groups: [{ name: 'kit', capacity }] } });
  assert.equal(manifestProblem(groups('kit.count')), null);
  for (const capacity of ['kit.size', 'kit.none']) assert.equal(manifestProblem(groups(capacity)), 'contributes.groups[0].capacity：capacity 是本插件声明的一项整数设置');
  // Relative: a row's required columns are its own.
  const row = required => ({ contributes: { configuration: { properties: { 'kit.rows': { type: 'object', additionalProperties: { type: 'object', properties: { url: { type: 'string' } }, required } } } } } });
  assert.equal(manifestProblem(row(['url'])), null);
  assert.match(manifestProblem(row(['key'])), /required\[0\]：required 是本行的列名，不重复$/);
  // A part of the text: a model service's key is one of its secrets.
  const provider = key => ({ contributes: { configuration: settings, modelProviders: [{ id: 'p', title: 'P', api: 'openai-completions', url: 'https://p', key }] } });
  assert.equal(manifestProblem(provider('${config:kit.key}')), null);
  assert.match(manifestProblem(provider('${config:kit.size}')), /^contributes\.modelProviders\[0\]\.key：/);
  // The plugin it plugs into is one it depends on.
  assert.equal(manifestProblem({ extensionDependencies: ['codex'], contributes: { extensions: { 'codex/accounts': { command: 'x' } } } }), null);
  assert.match(manifestProblem({ contributes: { extensions: { 'codex/accounts': { command: 'x' } } } }), /extensionDependencies 里的一个/);
});

test('x-placeholders: what a text may name, its own settings among them as asked', () => {
  const env = value => ({ contributes: { configuration: settings, environment: { KIT: value } } });
  for (const value of ['${config:kit.size}', '${CODA_PLUGIN_PATH}/bin', 'plain $HOME']) assert.equal(manifestProblem(env(value)), null, value);
  for (const value of ['${config:kit.key}', '${config:kit.none}', '${HOME}']) assert.match(manifestProblem(env(value)), /^contributes\.environment\.KIT：/, value);
});

test('x-file: a file or a directory of the plugin\'s, never leaving it, of its kind, with what it holds; or none there', () => {
  const dir = directory({ 'main.mjs': '', 'icon.pdf': '%PDF-1.4\n', 'icon.svg': '<svg/>', 'big.pdf': `%PDF-1.4\n${'x'.repeat(33 * 1024)}`,
    '.coda/capabilities/check.bpmn': '', '.coda/workflows/check.bpmn': '', '.coda/capabilities/lint.bpmn': '', 'skills/empty/.keep': '' });
  assert.equal(manifestProblem({ main: 'main.mjs', contributes: {} }, dir), null);
  assert.match(manifestProblem({ main: 'gone.mjs', contributes: {} }, dir), /^main：插件目录里没有 gone\.mjs/);
  assert.match(manifestProblem({ main: '../main.mjs', contributes: {} }, dir), /^main：\.\.\/main\.mjs 须为不离开插件目录的相对路径/);
  const agent = light => ({ contributes: { agents: [{ id: 'a', displayName: 'A', icon: { light }, command: 'x' }] } });
  assert.equal(manifestProblem(agent('icon.pdf'), dir), null);
  assert.match(manifestProblem(agent('icon.svg'), dir), /icon\.light：icon\.svg 不是 PDF/);
  assert.match(manifestProblem(agent('big.pdf'), dir), /icon\.light：big\.pdf 超过 32 KiB/);
  assert.match(manifestProblem({ contributes: { skills: ['skills/empty'] } }, dir), /skills\/empty 里没有 SKILL\.md/);
  assert.equal(manifestProblem({ contributes: { capabilities: ['lint'] } }, dir), null);
  assert.match(manifestProblem({ contributes: { capabilities: ['check'] } }, dir), /插件目录里已有 \.coda\/workflows\/check\.bpmn/);
  // Without a directory, what is in it is not asked.
  assert.equal(manifestProblem({ main: 'gone.mjs', contributes: {} }), null);
});

test('a part of a type, as a plugin gives it while it runs, is checked against the same schema', () => {
  const parameters = { type: 'object', properties: { template: { type: 'string', enum: ['quick', 'deep'] } } };
  assert.equal(valueProblem('composer-modes.json#/$defs/parameters', parameters, '插件给出的参数'), null);
  assert.equal(valueProblem('composer-modes.json#/$defs/parameters', { ...parameters, required: ['gone'] }, '插件给出的参数'),
    '插件给出的参数.required[0]：required 是本模式的参数名，不重复');
  assert.throws(() => valueProblem('nothing.json', {}, 'x'), /没有这个 schema/);
});

test('a server for Agents of another kind than one they start is told what a server is', () => {
  assert.equal(manifestProblem({ contributes: { mcpServers: { docs: { type: 'http', url: 'https://docs.example' } } } }),
    'contributes.mcpServers.docs 缺 command：一个服务器：由 Agent 在本机启动、经标准输入输出说话的程序（stdio），写 command 与 args；远程的（http、sse）现在不支持');
});

test('an extension point\'s schema is a file of its plugin\'s that compiles beside these; what another plugin writes for it is of it', () => {
  const panels = { description: '面板的数组', type: 'array', 'x-unique-by': ['id'],
    items: { type: 'object', properties: { id: { $ref: 'common.json#/$defs/name' }, title: { $ref: 'common.json#/$defs/line40' } }, required: ['id', 'title'], additionalProperties: false } };
  const dir = directory({ 'panels.json': JSON.stringify(panels), 'broken.json': '{', 'loose.json': JSON.stringify({ type: 'array', colour: 'red' }),
    'old.json': JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'array' }), 'panels.txt': '',
    'later.json': JSON.stringify({ $async: true, type: 'array' }), 'unpointed.json': JSON.stringify({ type: 'string', 'x-ref': {} }),
    'unparsed.json': JSON.stringify({ type: 'array', 'x-unique-by': [{ part: '[' }] }) });
  const point = schema => ({ name: 'kit', contributes: { extensionPoints: { panels: { description: '面板', contributes: 'panels', title: '面板', schema } } } });
  assert.equal(manifestProblem(point('panels.json'), dir), null);
  assert.match(manifestProblem(point('broken.json'), dir), /^contributes\.extensionPoints\.panels\.schema：broken\.json 不是可用的 JSON Schema：/);
  assert.match(manifestProblem(point('loose.json'), dir), /loose\.json 不是可用的 JSON Schema：strict mode: unknown keyword: "colour"/);
  assert.match(manifestProblem(point('old.json'), dir), /old\.json 不是可用的 JSON Schema：no schema with key or ref "http:\/\/json-schema\.org\/draft-07\/schema#"/);
  assert.match(manifestProblem(point('gone.json'), dir), /插件目录里没有 gone\.json/);
  // One that would answer later, or whose keywords are written wrong, is refused here, not where a value is checked by it.
  assert.match(manifestProblem(point('later.json'), dir), /later\.json 不是可用的 JSON Schema：不能是异步的（\$async）/);
  assert.match(manifestProblem(point('unpointed.json'), dir), /unpointed\.json 不是可用的 JSON Schema：keyword "x-ref" value is invalid at path "#": data must have required property 'pointer'/);
  assert.match(manifestProblem(point('unparsed.json'), dir), /unparsed\.json 不是可用的 JSON Schema：Invalid regular expression/);
  assert.match(manifestProblem(point('panels.txt'), dir), /^contributes\.extensionPoints\.panels\.schema：别的插件在这个键下写的东西的 JSON Schema/);
  // Only a point taking what others write has one.
  assert.equal(manifestProblem({ contributes: { extensionPoints: { accounts: { description: '账号', schema: 'panels.json' } } } }, dir),
    'contributes.extensionPoints.accounts：只有写了 contributes 的扩展点才写 title、commands 与 schema');

  assert.equal(pointProblem(panels, [{ id: 'quota', title: '额度' }], 'contributes.panels'), null);
  assert.equal(pointProblem(panels, {}, 'contributes.panels'), 'contributes.panels 须为数组：面板的数组');
  assert.equal(pointProblem(panels, [{ id: 'quota' }], 'contributes.panels'), 'contributes.panels[0] 缺 title');
  assert.equal(pointProblem(panels, [{ id: 'quota', title: ' ' }], 'contributes.panels'), 'contributes.panels[0].title：不超过 40 字的一行');
  assert.equal(pointProblem(panels, [{ id: 'quota', title: '额度' }, { id: 'quota', title: '又一个' }], 'contributes.panels'), 'contributes.panels：id 不能重复：quota');
  // The ID it gives itself is not where it is kept: one naming a schema of these takes nothing of it.
  assert.equal(pointProblem({ ...panels, $id: 'https://coda.pub/schemas/plugin/v1/common.json' }, [{ id: 'quota', title: '额度' }], 'contributes.panels'), null);
  assert.equal(valueProblem('common.json#/$defs/id', 'kit', 'x'), null);
  // The files a value names are the writing plugin's.
  const own = { type: 'string', 'x-file': { type: 'file' } };
  assert.equal(pointProblem(own, 'panels.json', 'contributes.icon', dir), null);
  assert.equal(pointProblem(own, 'gone.json', 'contributes.icon', dir), 'contributes.icon：插件目录里没有 gone.json');
});

