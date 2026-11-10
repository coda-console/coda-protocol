// The checker against manifests of every kind of mistake, one at a time: each is said where it is, in what the schema says
// there; its five keywords, each as it means the same thing wherever it is written; and an extension point's own schema.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { contributionProblem, manifestProblem, pointProblem, SCHEMAS, TYPES, valueProblem } from '../validate.mjs';

// What Coda checks of a manifest: the general keys by the manifest's schema, then each other key whose schema is kept here
// (`composerModes`: composer-modes.json) by that, in the whole manifest, as Coda's registry of contribution points does.
const checked = (manifest, dir) => manifestProblem(manifest, dir) ?? Object.keys(manifest.contributes ?? {})
  .map(key => [key, `${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}.json`])
  .filter(([key, file]) => !TYPES.includes(key) && Object.hasOwn(SCHEMAS, file))
  .map(([key, file]) => contributionProblem(SCHEMAS[file], manifest, key, dir)).find(Boolean) ?? null;

const dirs = [];
test('plugin channel requirements are optional, nonempty and name distinct backend channels', () => {
  for (const coda of [undefined, {}, { channels: ['preview'] }, { channels: ['stable'] }, { channels: ['stable', 'preview'] }])
    assert.equal(checked({ name: 'kit', ...(coda === undefined ? {} : { coda }) }), null);
  for (const coda of [null, [], 'preview', { channels: [] }, { channels: 'preview' }, { channels: ['beta'] }, { channels: ['preview', 'preview'] }, { channel: 'preview' }])
    assert.match(checked({ name: 'kit', coda }), /coda/);
});

test('a view may say how it is framed: document or canvas, or nothing to keep the current frame', () => {
  const view = { id: 'desk', title: '桌面', entry: 'desk.html' };
  for (const frame of [undefined, 'document', 'canvas'])
    assert.equal(checked({ contributes: { views: [frame === undefined ? view : { ...view, frame }] } }), null);
  for (const frame of ['page', 'side', 'Document', '', null, true])
    assert.match(checked({ contributes: { views: [{ ...view, frame }] } }), /^contributes\.views\[0\]\.frame：/);
});

after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
// A plugin's directory holding `files`.
function directory(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'coda-protocol-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) { mkdirSync(join(dir, name, '..'), { recursive: true }); writeFileSync(join(dir, name), content); }
  return dir;
}
const settings = { properties: { 'kit.size': { type: 'string' }, 'kit.count': { type: 'integer', default: 1 }, 'kit.key': { type: 'string', writeOnly: true } } };

test('an agent declares external lifecycle ownership without changing the default for existing agents', () => {
  const agent = { id: 'a', displayName: 'A', icon: { light: 'icon.pdf' }, command: 'run' };
  for (const extra of [{}, { lifecycle: 'managed' }, { lifecycle: 'external' }])
    assert.equal(checked({ contributes: { agents: [{ ...agent, ...extra }] } }), null);
  assert.match(checked({ contributes: { agents: [{ ...agent, lifecycle: 'persistent' }] } }), /lifecycle/);
});

test('the manifest\'s schema names only the general types; those of Coda\'s points are kept beside them, by file', () => {
  assert.deepEqual(TYPES, ['configuration', 'extensionPoints', 'extensions', 'services', 'setup', 'environment', 'path', 'endpoints', 'views',
    'protocols', 'protocolImplementations']);
  for (const type of TYPES) assert.ok(SCHEMAS['plugin.json'].properties.contributes.properties[type].$ref.endsWith('.json'), type);
  assert.deepEqual(Object.keys(SCHEMAS).filter(file => !TYPES.some(type => SCHEMAS['plugin.json'].properties.contributes.properties[type].$ref === file)).sort(),
    ['agents.json', 'capabilities.json', 'commands.json', 'common.json', 'composer-modes.json', 'events.json', 'executors.json',
      'git-credentials.json', 'groups.json', 'instructions.json', 'mcp-servers.json', 'model-providers.json', 'plugin.json',
      'repositories.json', 'setting.json', 'skills.json']);
  for (const [file, schema] of Object.entries(SCHEMAS)) assert.equal(schema.$id, `https://coda.pub/schemas/plugin/v2/${file}`);
});

test('a key of no general type passes the manifest\'s schema, whatever its shape; its own schema checks it in the whole manifest', () => {
  const agent = { id: 'a', displayName: 'A', icon: { light: 'icon.pdf' }, command: 'run' };
  for (const agents of [[agent], {}, [{ ...agent, lifecycle: 'persistent' }]]) assert.equal(manifestProblem({ name: 'kit', contributes: { agents } }), null);
  assert.match(manifestProblem({ contributes: { 'my-agents': [] } }), /^contributes「my-agents」：/);
  const manifest = { name: 'kit', contributes: { agents: [agent] } };
  assert.equal(contributionProblem(SCHEMAS['agents.json'], manifest, 'agents'), null);
  assert.match(contributionProblem(SCHEMAS['agents.json'], { contributes: { agents: {} } }, 'agents'), /^contributes\.agents 须为数组/);
  const dir = directory({ 'icon.svg': '<svg/>' });
  assert.match(contributionProblem(SCHEMAS['agents.json'], manifest, 'agents', dir), /^contributes\.agents\[0\]\.icon\.light：插件目录里没有 icon\.pdf/);
  // A pointer from the manifest's root finds the plugin's settings, as it does not in the value alone.
  const groups = { contributes: { configuration: settings, groups: [{ name: 'kit', capacity: 'kit.count' }] } };
  assert.equal(contributionProblem(SCHEMAS['groups.json'], groups, 'groups'), null);
  assert.match(pointProblem(SCHEMAS['groups.json'], groups.contributes.groups, 'contributes.groups'), /capacity/);
});

test('a manifest of the types it names is right; one key of no type, or of none Coda reads, is said where it is', () => {
  assert.equal(checked({ name: 'kit', contributes: { configuration: settings, instructions: '先读 README。', panels: [{ anything: 1 }] } }), null);
  assert.equal(checked({ name: 'kit', contributes: { 'my-panels': [] } }), 'contributes「my-panels」：contributes 的键：字母和数字，以小写字母开头');
  assert.equal(checked({ contributes: { composerModes: [{ id: 'go', title: '走', icon: 'bolt', colour: 'red' }] } }), 'contributes.composerModes[0] 里有不认识的键：colour');
  assert.equal(checked({ contributes: { composerModes: [{ id: 'go', icon: 'bolt' }] } }), 'contributes.composerModes[0] 缺 title');
  assert.match(checked({ contributes: { agents: {} } }), /^contributes\.agents 须为数组/);
  // A branch says what it is about when the value failing in it says nothing itself.
  assert.equal(checked({ contributes: { configuration: { properties: { 'kit.token': { type: 'integer', writeOnly: true } } } } }),
    'contributes.configuration.properties「kit.token」.type：密文设置（writeOnly）只能是没有 format、enum 与默认值的文本');
  assert.equal(checked({ contributes: { composerModes: [{ id: 'go', title: '走', icon: 'bolt', agent: 'own', in: ['new'] }] } }),
    'contributes.composerModes[0] 里有不认识的键：agent');
});

test('composer modes accept optional once and reject the removed agent field', () => {
  const mode = { id: 'go', title: '走', icon: 'bolt', hint: '提示', placeholder: '输入', sendLabel: '发送', in: ['session', 'new'] };
  const check = extra => checked({ contributes: { composerModes: [{ ...mode, ...extra }] } });
  for (const extra of [{}, { once: true }, { once: false }, { trigger: '!', once: true }])
    assert.equal(check(extra), null);
  for (const once of ['true', 1, null, [], {}]) assert.match(check({ once }), /once/);
  for (const agent of ['session', 'own', 'off']) assert.match(check({ agent }), /不认识的键：agent/);
  assert.match(check({ trigger: '!', parameters: { type: 'object', properties: { text: { type: 'string' } } } }), /trigger.*没有参数/);
  assert.match(check({ trigger: 'word' }), /trigger/);
  for (const location of [[], ['new', 'new'], ['other']]) assert.match(check({ in: location }), /in/);
});

test('presets only extend composer parameters containing object rows', () => {
  const rows = { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } };
  const presets = { from: 'composer.templates', by: 'template' };
  const check = (parameter, valid) => {
    const parameters = { type: 'object', properties: { subagents: parameter }, required: ['subagents'] };
    const manifest = { contributes: { composerModes: [{ id: 'ultra', title: 'Ultra', icon: 'bolt', parameters }] } };
    const original = structuredClone(manifest);
    const results = [checked(manifest), valueProblem('composer-modes.json#/$defs/parameters', parameters, '参数')];
    for (const result of results) {
      if (valid) assert.equal(result, null, JSON.stringify(parameter));
      else assert.equal(typeof result, 'string', JSON.stringify(parameter));
    }
    assert.deepEqual(manifest, original);
  };
  for (const parameter of [rows, { ...rows, presets }, { ...rows, presets: { from: '', by: '' } }]) check(parameter, true);
  for (const invalid of [null, true, [], 'table', {}, { from: 'table' }, { by: 'group' },
    { from: 1, by: 'group' }, { from: 'table', by: false }, { ...presets, extra: 'no' }])
    check({ ...rows, presets: invalid }, false);
  const otherTypes = [
    ...['string', 'number', 'integer', 'boolean'].map(type => ({ type })),
    { type: 'object', format: 'coda-agent' },
    { type: 'object', additionalProperties: { type: 'string' } },
    { type: 'array', items: { anyOf: [{ const: 'quick' }] } },
    { type: 'array', items: { type: 'string', format: 'coda-model-provider' } },
  ];
  for (const parameter of otherTypes) {
    check(parameter, true);
    check({ ...parameter, presets }, false);
  }
  for (const parameter of [
    { presets }, { type: 'array', presets },
    ...[null, true, {}, { properties: rows.items.properties }, { type: 'string' }, { type: 'object' }]
      .map(items => ({ type: 'array', items, presets })),
    { ...rows, presets, extra: 'no' }, { ...rows, presets, uniqueItems: true },
    { ...rows, presets, items: { ...rows.items, required: ['missing'] } },
    { ...rows, presets, items: { ...rows.items, properties: { key: { type: 'string', writeOnly: true } } } },
    { ...rows, items: { ...rows.items, presets } },
    { type: 'string', writeOnly: true },
    { type: 'object', additionalProperties: { type: 'object', properties: { key: { type: 'string', writeOnly: true } } } },
  ]) check(parameter, false);
  assert.equal(checked({ contributes: { configuration: { properties: { 'kit.rows': rows } } } }), null);
  assert.match(checked({ contributes: { configuration: { properties: { 'kit.rows': { ...rows, presets } } } } }), /presets/);
  assert.match(valueProblem('setting.json', { ...rows, presets }, '设置'), /presets/);
});

test('x-unique-by: a property of an array\'s objects, or a part of its texts, once', () => {
  const mode = { id: 'go', title: '走', icon: 'bolt' };
  assert.equal(checked({ contributes: { composerModes: [mode, mode] } }), 'contributes.composerModes：id 不能重复：go');
  assert.equal(checked({ contributes: { composerModes: [{ ...mode, trigger: '!' }, { ...mode, id: 'run', trigger: '!' }] } }), 'contributes.composerModes：trigger 不能重复：!');
  const dir = directory({ 'a/review/SKILL.md': '', 'b/review/SKILL.md': '' });
  assert.equal(checked({ contributes: { skills: ['a/review', 'b/review/'] } }, dir), 'contributes.skills：不能重复：review');
  assert.equal(checked({ contributes: { skills: ['a/review'] } }, dir), null);
});

test('x-max-contains: at most so many of an object\'s values are such', () => {
  const url = { type: 'string', format: 'coda-model-url' };
  assert.equal(checked({ contributes: { configuration: { properties: { 'kit.url': url } } } }), null);
  assert.match(checked({ contributes: { configuration: { properties: { 'kit.url': url, 'kit.other': url } } } }), /至多一个模型地址/);
});

test('x-ref: a name of something elsewhere in the manifest, of the kind asked, by where it is from the root or from the value', () => {
  const groups = capacity => ({ contributes: { configuration: settings, groups: [{ name: 'kit', capacity }] } });
  assert.equal(checked(groups('kit.count')), null);
  for (const capacity of ['kit.size', 'kit.none']) assert.equal(checked(groups(capacity)), 'contributes.groups[0].capacity：capacity 是本插件声明的一项整数设置');
  // Relative: a row's required columns are its own.
  const row = required => ({ contributes: { configuration: { properties: { 'kit.rows': { type: 'object', additionalProperties: { type: 'object', properties: { url: { type: 'string' } }, required } } } } } });
  assert.equal(checked(row(['url'])), null);
  assert.match(checked(row(['key'])), /required\[0\]：required 是本行的列名，不重复$/);
  // A part of the text: a model service's key is one of its secrets.
  const provider = key => ({ contributes: { configuration: settings, modelProviders: [{ id: 'p', title: 'P', api: 'openai-completions', url: 'https://p', key }] } });
  assert.equal(checked(provider('${config:kit.key}')), null);
  assert.match(checked(provider('${config:kit.size}')), /^contributes\.modelProviders\[0\]\.key：/);
  // The plugin it plugs into is one it depends on.
  assert.equal(checked({ extensionDependencies: ['codex'], contributes: { extensions: { 'codex/accounts': { command: 'x' } } } }), null);
  assert.match(checked({ contributes: { extensions: { 'codex/accounts': { command: 'x' } } } }), /extensionDependencies 里的一个/);
});

test('a model provider may speak the speech interface', () => {
  const provider = api => ({ contributes: { modelProviders: [{ id: 'p', title: 'P', api, url: 'https://p' }] } });
  assert.equal(checked(provider('openai-speech')), null);
  assert.match(checked(provider('openai-chat')), /^contributes\.modelProviders\[0\]\.api：/);
});

test('a single coda-model-provider value may name the interfaces it takes', () => {
  const setting = modelApis => ({ contributes: { configuration: { properties: { 'kit.speech': { type: 'string', format: 'coda-model-provider', modelApis } } } } });
  assert.equal(checked(setting(['openai-speech'])), null);
  assert.equal(checked(setting(['openai-completions', 'openai-speech'])), null);
  assert.match(checked(setting([])), /^contributes\.configuration\.properties「kit\.speech」\.modelApis：/);
  const table = { type: 'object', additionalProperties: { type: 'string', format: 'coda-model-provider', modelApis: ['openai-speech'] } };
  const row = { type: 'object', additionalProperties: { type: 'object', properties: { service: { type: 'string', format: 'coda-model-provider', modelApis: ['openai-speech'] } }, required: ['service'] } };
  for (const value of [table, row]) assert.equal(checked({ contributes: { configuration: { properties: { 'kit.table': value } } } }), null);
});

test('modelApis is only for coda-model-provider values', () => {
  const setting = property => ({ contributes: { configuration: { properties: { 'kit.speech': property } } } });
  for (const property of [
    { type: 'string', modelApis: ['openai-speech'] },
    { type: 'string', format: 'coda-model-url', modelApis: ['openai-speech'] },
  ]) assert.match(checked(setting(property)), /modelApis 只写在 coda-model-provider 上/);
});

test('x-placeholders: what a text may name, its own settings among them as asked', () => {
  const env = value => ({ contributes: { configuration: settings, environment: { KIT: value } } });
  for (const value of ['${config:kit.size}', '${CODA_PLUGIN_PATH}/bin', 'plain $HOME']) assert.equal(checked(env(value)), null, value);
  for (const value of ['${config:kit.key}', '${config:kit.none}', '${HOME}']) assert.match(checked(env(value)), /^contributes\.environment\.KIT：/, value);
});

test('a plugin\'s icon is PDFs of its directory, as an agent\'s, or a symbol on a system colour; none keeps the default', () => {
  const dir = directory({ 'icon.pdf': '%PDF-1.4\n', 'dark.pdf': '%PDF-1.4\n', 'icon.svg': '<svg/>' });
  for (const icon of [undefined, { light: 'icon.pdf' }, { light: 'icon.pdf', dark: 'dark.pdf', template: true }, { symbol: 'key.fill', color: 'yellow' }, { symbol: 'gauge', color: 'indigo' }])
    assert.equal(checked(icon === undefined ? { description: '一句话' } : { icon }, dir), null, JSON.stringify(icon));
  assert.match(checked({ icon: { light: 'icon.svg' } }, dir), /^icon\.light：icon\.svg 不是 PDF/);
  assert.match(checked({ icon: { light: 'gone.pdf' } }, dir), /^icon\.light：插件目录里没有 gone\.pdf/);
  assert.equal(checked({ icon: { symbol: 'key.fill' } }, dir), 'icon 缺 color');
  assert.match(checked({ icon: { symbol: 'key.fill', color: 'magenta' } }, dir), /^icon\.color：底色/);
  for (const symbol of ['Key.Fill', 'key..fill', 'key fill', '', '.key'])
    assert.match(checked({ icon: { symbol, color: 'blue' } }, dir), /^icon\.symbol：SF Symbols/, symbol);
  assert.equal(checked({ icon: { symbol: 'key.fill', color: 'blue', light: 'icon.pdf' } }, dir), 'icon 里有不认识的键：light');
  assert.equal(checked({ icon: { dark: 'dark.pdf' } }, dir), 'icon 缺 light');
  assert.match(checked({ icon: 'icon.pdf' }, dir), /^icon 须为对象/);
  assert.match(checked({ description: ['长'] }), /^description 须为/);
});

test('x-file: a file or a directory of the plugin\'s, never leaving it, of its kind, with what it holds; or none there', () => {
  const dir = directory({ 'main.mjs': '', 'icon.pdf': '%PDF-1.4\n', 'icon.svg': '<svg/>', 'big.pdf': `%PDF-1.4\n${'x'.repeat(33 * 1024)}`,
    '.coda/capabilities/check.bpmn': '', '.coda/workflows/check.bpmn': '', '.coda/capabilities/lint.bpmn': '', 'skills/empty/.keep': '' });
  assert.equal(checked({ main: 'main.mjs', contributes: {} }, dir), null);
  assert.match(checked({ main: 'gone.mjs', contributes: {} }, dir), /^main：插件目录里没有 gone\.mjs/);
  assert.match(checked({ main: '../main.mjs', contributes: {} }, dir), /^main：\.\.\/main\.mjs 须为不离开插件目录的相对路径/);
  const agent = light => ({ contributes: { agents: [{ id: 'a', displayName: 'A', icon: { light }, command: 'x' }] } });
  assert.equal(checked(agent('icon.pdf'), dir), null);
  assert.match(checked(agent('icon.svg'), dir), /icon\.light：icon\.svg 不是 PDF/);
  assert.match(checked(agent('big.pdf'), dir), /icon\.light：big\.pdf 超过 32 KiB/);
  assert.match(checked({ contributes: { skills: ['skills/empty'] } }, dir), /skills\/empty 里没有 SKILL\.md/);
  assert.equal(checked({ contributes: { capabilities: ['lint'] } }, dir), null);
  assert.match(checked({ contributes: { capabilities: ['check'] } }, dir), /插件目录里已有 \.coda\/workflows\/check\.bpmn/);
  // Without a directory, what is in it is not asked.
  assert.equal(checked({ main: 'gone.mjs', contributes: {} }), null);
});

test('a part of a type, as a plugin gives it while it runs, is checked against the same schema', () => {
  const parameters = { type: 'object', properties: { template: { type: 'string', enum: ['quick', 'deep'] } } };
  assert.equal(valueProblem('composer-modes.json#/$defs/parameters', parameters, '插件给出的参数'), null);
  assert.equal(valueProblem('composer-modes.json#/$defs/parameters', { ...parameters, required: ['gone'] }, '插件给出的参数'),
    '插件给出的参数.required[0]：required 是本模式的参数名，不重复');
  assert.throws(() => valueProblem('nothing.json', {}, 'x'), /没有这个 schema/);
});

test('a server for Agents of another kind than one they start is told what a server is', () => {
  assert.equal(checked({ contributes: { mcpServers: { docs: { type: 'http', url: 'https://docs.example' } } } }),
    'contributes.mcpServers.docs 缺 command：一个服务器：由 Agent 在本机启动、经标准输入输出说话的程序（stdio），写 command 与 args；远程的（http、sse）现在不支持');
});

test('an extension point\'s schema is a file of its plugin\'s that compiles beside these; what another plugin writes for it is of it', () => {
  const panels = { description: '面板的数组', type: 'array', 'x-unique-by': ['id'],
    items: { type: 'object', properties: { id: { $ref: 'common.json#/$defs/name' }, title: { $ref: 'common.json#/$defs/line40' } }, required: ['id', 'title'], additionalProperties: false } };
  const dir = directory({ 'panels.json': JSON.stringify(panels), 'broken.json': '{', 'loose.json': JSON.stringify({ type: 'array', colour: 'red' }),
    'old.json': JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'array' }), 'panels.txt': '',
    'later.json': JSON.stringify({ $async: true, type: 'array' }), 'unpointed.json': JSON.stringify({ type: 'string', 'x-ref': {} }),
    'unparsed.json': JSON.stringify({ type: 'array', 'x-unique-by': [{ part: '[' }] }),
    'inner.json': JSON.stringify({ type: 'string', 'x-ref': { pointer: '/target', match: { $async: true, type: 'string' } } }),
    'innerConfig.json': JSON.stringify({ type: 'string', 'x-placeholders': { config: { $async: true } } }),
    'anything.json': 'true', 'nothing.json': 'false', 'list.json': '[]' });
  const point = schema => ({ name: 'kit', contributes: { extensionPoints: { panels: { description: '面板', contributes: 'panels', title: '面板', schema } } } });
  assert.equal(checked(point('panels.json'), dir), null);
  assert.match(checked(point('broken.json'), dir), /^contributes\.extensionPoints\.panels\.schema：broken\.json 不是可用的 JSON Schema：/);
  assert.match(checked(point('loose.json'), dir), /loose\.json 不是可用的 JSON Schema：strict mode: unknown keyword: "colour"/);
  assert.match(checked(point('old.json'), dir), /old\.json 不是可用的 JSON Schema：no schema with key or ref "http:\/\/json-schema\.org\/draft-07\/schema#"/);
  assert.match(checked(point('gone.json'), dir), /插件目录里没有 gone\.json/);
  // One that would answer later, or whose keywords are written wrong, is refused here, not where a value is checked by it.
  assert.match(checked(point('later.json'), dir), /later\.json 不是可用的 JSON Schema：不能是异步的（\$async）/);
  assert.match(checked(point('unpointed.json'), dir), /unpointed\.json 不是可用的 JSON Schema：keyword "x-ref" value is invalid at path "#": data must have required property 'pointer'/);
  assert.match(checked(point('unparsed.json'), dir), /unparsed\.json 不是可用的 JSON Schema：Invalid regular expression/);
  for (const file of ['inner.json', 'innerConfig.json']) assert.match(checked(point(file), dir), /不是可用的 JSON Schema：不能是异步的（\$async）/, file);
  // A schema of true or false is one; what is neither an object nor those is none.
  for (const file of ['anything.json', 'nothing.json']) assert.equal(checked(point(file), dir), null, file);
  assert.match(checked(point('list.json'), dir), /list\.json 不是可用的 JSON Schema：schema is invalid/);
  assert.equal(pointProblem(true, [{ any: 1 }], 'contributes.panels'), null);
  assert.equal(pointProblem(false, [], 'contributes.panels'), 'contributes.panels：boolean schema is false');
  assert.match(checked(point('panels.txt'), dir), /^contributes\.extensionPoints\.panels\.schema：别的插件在这个键下写的东西的 JSON Schema/);
  // Only a point taking what others write has one.
  assert.equal(checked({ contributes: { extensionPoints: { accounts: { description: '账号', schema: 'panels.json' } } } }, dir),
    'contributes.extensionPoints.accounts：只有写了 contributes 的扩展点才写 title、commands 与 schema');

  assert.equal(pointProblem(panels, [{ id: 'quota', title: '额度' }], 'contributes.panels'), null);
  assert.equal(pointProblem(panels, {}, 'contributes.panels'), 'contributes.panels 须为数组：面板的数组');
  assert.equal(pointProblem(panels, [{ id: 'quota' }], 'contributes.panels'), 'contributes.panels[0] 缺 title');
  assert.equal(pointProblem(panels, [{ id: 'quota', title: ' ' }], 'contributes.panels'), 'contributes.panels[0].title：不超过 40 字的一行');
  assert.equal(pointProblem(panels, [{ id: 'quota', title: '额度' }, { id: 'quota', title: '又一个' }], 'contributes.panels'), 'contributes.panels：id 不能重复：quota');
  // The ID it gives itself is not where it is kept: one naming a schema of these takes nothing of it.
  assert.equal(pointProblem({ ...panels, $id: 'https://coda.pub/schemas/plugin/v2/common.json' }, [{ id: 'quota', title: '额度' }], 'contributes.panels'), null);
  assert.equal(valueProblem('common.json#/$defs/id', 'kit', 'x'), null);
  // The files a value names are the writing plugin's, also where a keyword's own schema names them.
  const own = { type: 'string', 'x-file': { type: 'file' } };
  assert.equal(pointProblem(own, 'panels.json', 'contributes.icon', dir), null);
  assert.equal(pointProblem(own, 'gone.json', 'contributes.icon', dir), 'contributes.icon：插件目录里没有 gone.json');
  const named = match => ({ type: 'object', properties: { icon: { description: '图标是 files 里的一个', type: 'string', 'x-ref': { pointer: '/files', match } } } });
  assert.equal(pointProblem(named(own), { files: { light: 'panels.json' }, icon: 'light' }, 'contributes.icon', dir), null);
  assert.equal(pointProblem(named(own), { files: { light: 'gone.json' }, icon: 'light' }, 'contributes.icon', dir), 'contributes.icon.icon：图标是 files 里的一个');
  const most = { type: 'object', 'x-max-contains': { match: { not: own }, max: 0 } };
  assert.equal(pointProblem(most, { light: 'panels.json' }, 'contributes.icon', dir), null);
  assert.match(pointProblem(most, { light: 'gone.json' }, 'contributes.icon', dir), /^contributes\.icon：/);
  // A keyword's schema of false takes nothing, of an object's keys or an array's elements.
  assert.equal(pointProblem(named(false), { files: { light: 'panels.json' }, icon: 'light' }, 'contributes.icon'), 'contributes.icon.icon：图标是 files 里的一个');
  assert.equal(pointProblem(named(false), { files: ['light'], icon: 'light' }, 'contributes.icon'), 'contributes.icon.icon：图标是 files 里的一个');
  assert.equal(pointProblem(named({ const: 'light' }), { files: ['light'], icon: 'light' }, 'contributes.icon'), null);
  // A keyword's schema checks the value where it is in the whole: its pointers go from there, to the whole's root.
  const chosen = { type: 'object', properties: { icon: { description: '图标是 files 里的一个', type: 'string',
    'x-ref': { pointer: '/files', match: { properties: { theme: { 'x-ref': { pointer: '/themes' } }, near: { 'x-ref': { pointer: '2/spare' } } } } } } } };
  const themed = (file, more = {}) => ({ themes: { dark: 1 }, files: { light: file, spare: { b: 1 } }, icon: 'light', ...more });
  assert.equal(pointProblem(chosen, themed({ theme: 'dark', near: 'b' }), 'contributes.icon'), null);
  assert.equal(pointProblem(chosen, themed({ theme: 'bad', themes: { dark: 1 } }), 'contributes.icon'), 'contributes.icon.icon：图标是 files 里的一个');
  assert.equal(pointProblem(chosen, themed({ theme: 'bad', themes: { bad: 1 } }), 'contributes.icon'), 'contributes.icon.icon：图标是 files 里的一个');
  assert.equal(pointProblem(chosen, themed({ near: 'c' }), 'contributes.icon'), 'contributes.icon.icon：图标是 files 里的一个');
  const counted = { type: 'object', properties: { uses: { type: 'object', 'x-max-contains': { match: { properties: { on: { 'x-ref': { pointer: '/enabled' } } }, required: ['on'] }, max: 1 } } } };
  assert.equal(pointProblem(counted, { enabled: { x: 1 }, uses: { a: { on: 'x' }, b: { on: 'y' } } }, 'contributes.uses'), null);
  assert.match(pointProblem(counted, { enabled: { x: 1 }, uses: { a: { on: 'x' }, b: { on: 'x' } } }, 'contributes.uses'), /^contributes\.uses\.uses：/);
});


// Project-scoped choices use workflow kinds, while personal choices need no condition.
test('multi-select options may require a declared workflow kind', () => {
  const spec = workflowKind => ({ contributes: { configuration: { properties: { 'kit.defaults': {
    type: 'array', items: { anyOf: [{ const: 'notify' }, { const: 'deploy', workflowKind }] }, default: []
  } } } } });
  for (const kind of ['check', 'premerge', 'prebuild', 'develop', 'deploy', 'preview', 'release']) assert.equal(checked(spec(kind)), null);
  for (const kind of ['', 'unknown', true, ['deploy']]) assert.match(checked(spec(kind)), /workflowKind/);
});

test('x-ref can name an array item by its own property, with each separated name satisfying match', () => {
  const schema = { type: 'object', properties: { uses: { type: 'string', description: '引用一个可用项',
    'x-ref': { pointer: '/items', key: 'id', split: '[\\s,]+', match: { properties: { enabled: { const: true } }, required: ['enabled'] } } } } };
  const items = [{ id: 'constructor', enabled: true }, { id: '__proto__', enabled: true }, { id: 'off', enabled: false }];
  for (const uses of ['', ', ', 'constructor, __proto__', '__proto__ constructor constructor'])
    assert.equal(pointProblem(schema, { items, uses }, '引用'), null);
  for (const uses of ['missing', 'off', 'constructor, off', 'toString'])
    assert.equal(pointProblem(schema, { items, uses }, '引用'), '引用.uses：引用一个可用项');
  assert.equal(pointProblem(schema, { items: [Object.create({ id: 'inherited', enabled: true })], uses: 'inherited' }, '引用'), '引用.uses：引用一个可用项');
});
