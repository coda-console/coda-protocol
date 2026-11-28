# Coda 协议

Coda 与插件之间的约定，Coda 和插件都引用它，独立演进：

- **插件清单的类型**（`schemas/plugin/`）：插件目录 `package.json` 里 `contributes` 的每个键是一种类型，各有一份 JSON Schema（draft 2020-12，`$id` 为 `https://coda.pub/schemas/plugin/v2/<文件>`）。`plugin.json` 是整份清单，只列通用键（`configuration`、`services`、`setup`、`environment`、`path`、`views`、`protocols`、`protocolImplementations`、`optionalProtocolImplementations`、`reservedAccordKinds`、`records`）；`setting.json` 是一项设置的声明。其余键由 Coda 的贡献点登记表声明：Coda 自己的（`agents`、`composerModes`、`modelProviders` 等）的 schema 仍放在这里作公开数据（如 `agents.json`、`composer-modes.json`），由登记它的 provider 引用；`contributes` 里只有 Coda 认得的键。
- **通用校验器**（`validate.mjs`）：用 Ajv 对清单做 schema 校验。JSON Schema 说不了的只用五个通用关键字（`x-unique-by`、`x-max-contains`、`x-ref`、`x-placeholders`、`x-file`，照 Kubernetes 的 `x-kubernetes-*`），每个在哪里写都是同一个意思，写法见文件开头。校验器不随功能变长：类型加字段就是改 schema。例外是清单级的两条跨字段约束：`manifestProblem` 在 schema 通过后还会检查，同一协议不能既是必需实现（`protocolImplementations`）又是可选实现（`optionalProtocolImplementations`），保留种类（`reservedAccordKinds`）的命名空间须等于插件 ID；只拿 `plugin.json` 校验，只查形状，这两条不在内。
- **协议定义与调用**（`schemas/protocol/`、`protocol.mjs`、`docs/protocol.md`）：协议是 `命名空间/名字@大版本` + spec/status 的 JSON Schema + 操作；插件在 `contributes.protocols` 里定义自己命名空间下的协议，在 `contributes.protocolImplementations` 里声明实现哪些协议；定义可写 `streams` 声明记录流（读、写、原样 HTTP 三种形状，字节或帧），可写 `events` 声明事件（载荷格式与 `starts`、`ends`；只有事件的协议可以不写 `spec`、`status`、`operations`，`protocolHasRecords` 判断一份定义有没有记录），可写 `permissions` 把操作、流、事件与记录的读取分成权限组，插件在清单根的 `uses`（必需）或 `optionalUses`（可选）里按组申请。调用是 `{ record, operation, input, requestId, parent, awaited }`，回答是 `{ result }` 或 `{ run }`；`coda/run@1`、`coda/agent@1`、`coda/session@1`、`coda/environment@1`、`coda/card@1` 是五个核心协议。
- **流程方言**（`workflow/`）：项目和插件的流程（`.coda/workflows/*.bpmn`，BPMN 2.0）在 Coda 的命名空间 `https://coda.pub/schema/bpmn/1.0` 里能写什么。`moddle.json` 是 `coda:` 属性与元素（bpmn-moddle 的描述格式），`values.json` 是每个值能写什么（每个 `coda:` 类型的属性组成的对象的 JSON Schema，一个元素里同种 `coda:` 元素成组的 schema），`actions.json` 是 `coda:action` 的各个动作和它们接受的参数，`dialect.json` 是 Coda 自己发的事件、步骤失败的错误码、表达式能读的运行变量和运行的输入能是哪些类型。`workflow.mjs` 用它们读一份流程：方言里没有的、值不合 schema 的都拒绝，说法是「位置：schema 对那里的说明」。值的 schema 用清单的那几个关键字，另加三个：`x-feel`（是 FEEL：「=」开头是表达式，否则文字里的 `{{ … }}` 是，按这份流程里的名字读得通）、`x-duration`（ISO 8601 时长，不为负）、`x-number`（文字换算成数字是个有限的数）。`structure.json` 声明流程结构规则，`structure.mjs` 负责跨节点检查。
- **Agent 接入扩展**（`schemas/agent/`、`agent.mjs`、`docs/agent-protocol.md`）：Coda 怎样用 ACP 接 Agent，以及 Coda 加的扩展（会话指令、插话、`_coda/wait`、`_coda/quota` 账号额度、执行失败、工具调用的审核、配置探测）。

流程方言的 **结构规则**从 1.8.0 起也由 `readWorkflow` / `workflowProblem` 检查。`workflow/structure.json` 声明支持的顶层元素与不支持的流程元素、各位置的事件定义、`coda:` 属性的位置限制、任务与多实例的局部写法、脚本数量、定时间隔和生命周期等待类型。`rules` 使用 JSON Schema 检查节点的无环投影（原始标量属性与父级、事件种类等固定事实），复用 `newAjv()` 和已有关键字；`moddle.json` 的 `extends` 仍声明属性可附着的基础类型。`CODA_STRUCTURE` 导出同一份表。新增局部规则改数据，不增加校验器分支。

`structure.mjs` 的固定检查处理数据表无法单独表达的关系：事件子流程与顺序流、连接事件按作用域配对、事件网关的出口、补偿关联、经过子流程与边界事件的可达性、事件启动以及生命周期的「聋状态」。Coda 的事件名通过 `dialect.json` 的 `eventRoles` 读取；等待动作与节点类型也来自数据表。ISO 8601 重复间隔用 `@0dep/piso` 解析，脚本变量边界用固定的词法扫描检查，条件和 documentation 用同一份 FEEL 检查。图和嵌套树使用显式栈与 Map/Set，不递归、不把大数组展开成函数参数。报错尽量保留 Coda 的原位置与原话。

读取定义时原有的 Coda 结构规则已全部纳入协议。Coda 接入 1.8.0 后，`parseBpmn` 只需调用 `readWorkflow`，再把 `root` 编译成引擎、任务、调度和图所需的结构；运行时才能知道的表达式结果、动态字段引用、调度设置实际值及能力是否存在，仍由宿主在运行时检查。

流程方言的 **挂点**是流程之间互相找到的方式：被调用的流程在自己的 extensionElements 里写 `<coda:join hook name? detail? default? order?/>` 加入一个挂点（`hook` 是小写字母开头的名字，一个流程每个挂点只加入一次），`name`、`detail` 是它作为勾选项时的名字与说明，`default` 是否默认勾上（只写 true 或 false：挂点的列表在任何运行之外读出），`order` 是整数，小的在前；`inputs` 是它要从卡片拿的自己的文字参数（`coda:input`，type 为 string，逗号或空格分隔，最多 4 个，读流程时检查），`joinInputNames(join)` 读出这些名字。宿主用动作 `hook-joiners` 列出一个挂点的加入者（勾选项形状，带上各自的 `inputs`，可直接给 `coda:optionList`），用 `run-workflows` 的 `hook`（必写）调用它们，`only` 只调用勾中的几个。挂点名是普通字符串，传哪些参数、怎么选由声明它的宿主写在自己的说明里。流程属性 `coda:mergedOnly` 说它是否只运行已合并进默认分支的提交，不写为 false（任何提交都能跑）。

流程方言的 **拦下提问**由流程属性 `coda:questionDenial` 声明（字符串）：写了它，这个运行进行期间，持有这个运行或它的子运行里没结束的 agent 任务的会话，向用户提问时，宿主当场拒绝，把这段文字回给 Agent（表单回 `decline`，文字放在 `_meta.coda.reason`，见 [Agent 接入协议](docs/agent-protocol.md)）；不写就不拦。父子运行都声明时：从会话所持任务所在的运行开始往上找，用离它最近的一段；子运行没声明，就沿用祖先的声明。它自己的要求：非空白，1–2000 个字符（以 `workflow/values.json` 里的定义为准），空串或全空白读流程时报错，不想拦就别写。权限审批、链接表单、密钥卡、请用户操作桌面、指给用户的流程任务（`coda:assignee="user"`），都不拦。

流程方言的 **勾选项**写在答复（外层的 `coda:choice`）里：`coda:option` 是一项，`coda:optionList` 的 `value` 是一个表达式，任务打开时读出一组勾选项（列表或它的 JSON），在它写的位置展开，两者按写的顺序排。`<coda:options>` 不是它的写法（那个名字是答复自己的勾选项集合）。定义里每个 `coda:optionList` 算一项；打开后的整组由 `workflow/options.json` 定义：每项是 `{ id, name, detail?, default?, inputs? }`（`default` 为布尔值，没有 `shown`），最多 12 项，id 不重复；`inputs` 是勾上这一项时卡片上出现的文字输入，每个 `{ id, label }`，一项最多 4 个、id 不重复，几项带同一个 id 时卡上只出一个。`optionsProblem(options, where)` 检查一个答复打开后的整组（静态项已求值、各组已展开），合法时返回 `null`，否则返回「位置：说明」；表达式求值与展开仍由 Coda 完成。

流程方言的 **卡片字段**由 `workflow/fields.json` 定义：九种字段各能写哪些属性、必填项、文字长度与单行限制、路径与网址、视图参数、输入框与密钥选项、多选的选项表、一组客户端操作；`values.json` 的 `Field` 引用它，`Fields` 声明读出 JSON 字段列表的表达式，`UserTask.children` 限定最多 12 个静态字段、id 不重复，以及全部字段已知时答复的 `fields` 只能引用输入字段（含按住出现的答复）。

输入字段有 `text`、`secret` 与多选 `choices`。`choices` 的 `options` 是选项表，每项 `{ id, label, detail?, disabled? }`（`id` 一行、1–64 个字、前后不带空白、表中不重复，`label` 一行、1–80 个字、前后不带空白，`detail` 一行不超过 200 字，`disabled` 为 true 的列出但不能勾），1–32 项，至少一项能勾；`default` 是初始勾上的选项 id，每个须是 options 里能勾的一项，不写就是都不勾；两者都可写表达式在任务打开时读，读出（或直接写下）的是 JSON 数组或它的文字。`required`（默认 true）要求至少勾一项。答复是勾中项的 id 组成的数组，按 options 的顺序，在答复的 `values.<id>` 里（其余输入是文字，它是数组），流程读 `=<任务>.values.<id>`，是 FEEL 列表；它不认识机器或别的什么，选项的意思由给出它的步骤定（如 `check-setting` 的 `machines`）。

显示字段（`markdown`、`code`、`image`、`link`、`view`、`operations`）不进答复，不能写 `required`、`default` 之类输入属性。`operations` 是一组客户端操作：卡片上点一下，客户端按顺序在本机执行。`steps` 必写，是 1–20 项的 JSON 数组（或它的文字，可写表达式在任务打开时读），每项 `{ op, args?, into? }`，不许别的键：`op` 是小写点分名字（至少两段，每段小写字母开头，只含小写字母、数字，第二段起可含「-」，如 `space.create`），最长 64 个字符；`args` 是 JSON 对象，值只能是字符串、数字或布尔，不能嵌套对象、数组或 null；`into` 是同一张卡上另一个字段的 id。`steps` 不超过 32768 字节；`label` 可选，是这组操作的标题。操作有哪些、怎么执行由客户端决定，协议只定形状。`into` 须指向同一张卡上已声明的 `text` 或 `secret` 字段，这个字段自己是 `operations`，所以也不会指到自己：用 `x-ref` 在整卡的校验（`values.json` 的 `UserTask.children`）里查，`steps` 是数组或 JSON 文字都一样。读定义时查静态字段（卡上有 `coda:fields` 时不查，那时整张卡还不知道）；`fieldsProblem` 查展开后的整张卡，与 `workflowProblem` 说法相同。单独的 `fieldProblem` 只看一个字段，只查 `into` 是字段 id 的写法。

脚本步骤的 **工作副本** 由 `coda:source` 声明：这一步在哪个工作副本目录里跑，写本机上的绝对路径，可以写 FEEL 表达式。它只用于 `coda:checkout="false"` 的步骤：在那个目录里就地跑，不检出提交。

定义和运行时共用这一份 schema。`x-deferred` 包住一个 schema：读定义时，文字先检查 FEEL，表达式或含 `{{ … }}` 的模板留到打开任务后查；运行时只按包住的 schema 严格检查，不再把结果当表达式。只有内容属性使用它，`type`、`id`、布尔值、枚举和 `maxLength` 不放宽。另有 `x-length`（沿用 Coda 的 UTF-16 长度，可用 `{ "property": "maxLength" }` 读取同一对象的上限）、`x-json`（解析 JSON 文字或检查 JSON 值，按序列化后的 UTF-8 字节数限制大小）、`x-among`（`{ property, key, match? }`：数组的每一项是同一对象里 `property`（数组或它的 JSON 文字）某一项的 `key`，且那一项合乎 `match`；`property` 还是定义里的表达式时不查）；`absolute-path`、`https-url`、`link-url` 三个 format 按本机路径与 URL 解析器检查；`link-url` 接受 https 网址或 `action=download-manifest` 且 `url` 解码后为 https 网址的 `itms-services:` 安装链接。已有的 `x-ref` 增加 `key`（按数组元素的属性引用）和 `split`（逐个检查分隔后的名字）。这些操作都不改写输入。

`fieldProblem(field, where)` 检查一个已求值的字段；`fieldsProblem(fields, where)` 检查展开并应用 `host`/`dir` 后的数组，复用同一份字段 schema、数量和唯一性规则。两者合法时返回 `null`，否则返回「位置：说明」；`where` 是调用方给出的完整位置。schema 的 `default` 仅作标注：默认值填充、去空白、域名转小写、`args` 解析后的保留、表达式求值、动态字段展开和用户答复的处理仍由 Coda 完成。`coda:fields` 的 `host`/`dir` 是可能被覆盖或忽略的备用值，定义时只检查 FEEL，合并后才检查实际字段。动态字段展开后，答复的输入引用仍须由 Coda 检查。

## 用法

```sh
npm install @coda-console/protocol
```

```js
import { contributionProblem, manifestProblem, pointProblem, valueProblem, TYPES, SCHEMAS } from '@coda-console/protocol/validate';

// 整份清单的外壳与通用键；给出插件目录时，连同它点名的文件一起查（x-file）。合乎类型返回 null，否则是一句说明：哪里、schema 怎么说。
const manifest = JSON.parse(readFileSync('plugin/package.json', 'utf8'));
const problem = manifestProblem(manifest, 'plugin');
// 不是通用键的一个键，按声明它的一方给的 schema，放在整份清单里查：指针从清单的根算（modelProviders 的 ${config:…} 指向本插件的设置）。
contributionProblem(SCHEMAS['agents.json'], manifest, 'agents', 'plugin');
// 某个类型里的一部分，如输入框模式声明的参数。
valueProblem('composer-modes.json#/$defs/parameters', parameters, '插件给出的参数');
// 一个独立的值，按给定的 schema（已读出的对象）校验；给出插件目录时连同值里点名的文件一起查。
pointProblem(valueSchema, value, 'contributes.panels', 'plugin');
```

```js
import {
  RUN_PROTOCOL, AGENT_PROTOCOL, SESSION_PROTOCOL, ENVIRONMENT_PROTOCOL, CARD_PROTOCOL, RESOURCE_PROTOCOL, CORE_PROTOCOLS,
  definitionProblem, ownedProtocolsProblem, runStatusProblem,
  invocationRequestProblem, invocationResponseProblem,
  parseProtocolName, formatProtocolName, protocolShortName,
} from '@coda-console/protocol/protocol';

parseProtocolName('coda/run@1'); // { namespace: 'coda', name: 'run', major: 1 }
protocolShortName('coda/run@1'); // 'coda-1run-21'
definitionProblem(RUN_PROTOCOL); // null，或说明
ownedProtocolsProblem(manifest); // contributes.protocols 只能在自己的命名空间下
runStatusProblem({ state: 'completed', result: null }, { state: 'working' }); // 终态不能再变
invocationRequestProblem({ record: { kind: 'coda/session@1', id: 'chat-1' }, operation: 'post', input: { text: 'hi' },
  requestId: 'r1', parent: { kind: 'coda/run@1', id: 'caller-run' }, awaited: true });
invocationResponseProblem({ run: { kind: 'coda/run@1', id: 'run-1' } });
```

```js
import { resourceRecordsProblem } from '@coda-console/protocol/validate';

// 插件写 coda/resource@1 记录时，命令输出（已解析的 JSON）按 Coda 收的标准查：合乎返回 null，否则是第一处问题，按记录在数组里的位置说。
// 数组里每条 { key, spec, status?, labels? }：序列化后至多 64 KiB，key 为 1–256 个字符、不含 NUL 且不重复，不写 id，spec、status 合协议的 schema，
// spec.type 与 key 相同，按钮的 args 序列化后至多 4096 字节。纯函数，不读文件、不跑命令。
const problem = resourceRecordsProblem(JSON.parse(output));
```

```js
import { readFrames, writeFrames } from '@coda-console/protocol/frames';

// 帧流（定义里写了 frames: true 的流）的读写：一行一个 JSON 对象，空行是心跳；只用 Web 标准的流，浏览器里也能跑。
for await (const frame of readFrames(request.body)) handle(frame);
const body = writeFrames(frames, { heartbeatMs: 15000 });
```

```js
import { parseBlobPath } from '@coda-console/protocol/blob';

// 指针的 path 是哪一类、各部分是什么；不认得给 null。不依赖 Node，浏览器里也能跑。
parseBlobPath('plugins/wechat/services/media/a.jpg'); // { kind: 'service', plugin: 'wechat', service: 'media', path: 'a.jpg' }
parseBlobPath('content/' + 'f'.repeat(64)); // { kind: 'content', sha256: 'ffff…' }，内容寻址：64 位小写十六进制 SHA-256
```

```js
import { identityTitles, nicknameOf, tailOf, accordIdentity, identiconPattern } from '@coda-console/protocol/accord';

// Accord 公钥（author，`ed25519:<64 位小写十六进制>`）怎样给人看：昵称、78 位十进制尾号、撞号消歧后的标题、5×5 头像网格。
// 零依赖，只用标准 JS（Uint8Array、BigInt），不 import 任何 node: 模块、不用 Buffer，Node 与浏览器原生 ESM 都能直接跑。
// 跨语言共用测试向量在 `@coda-console/protocol/vectors/accord.json`，Swift 与各插件拿它对齐。
accordIdentity(author); // { author, key, short, name, tail, tag }，author 不合法给 null
identityTitles(authors); // Map<author, 'sakura #8283'>：同昵称撞了末 4 位就向左加位（'xs #14084'）；解不出昵称的给 8 位十六进制
identiconPattern(author); // 5×5 水平轴对称的布尔网格，亮格 8 到 18 个；也收 32 字节公钥
```

```js
import { workflowProblem, readWorkflow, fieldProblem, fieldsProblem, optionsProblem, joinInputNames, CODA_FIELDS, CODA_OPTIONS } from '@coda-console/protocol/workflow';

// 一份流程（名字不带 .bpmn，用在说明里）：方言里都有就返回 null，否则是一句说明。
const problem = await workflowProblem(readFileSync('.coda/workflows/deploy.bpmn', 'utf8'), 'deploy');
// 要接着读它的：{ root } 是解析好的 definitions，或 { problem }。
const { root } = await readWorkflow(source, 'deploy');
// 任务打开、接受答复时检查已求值的字段，不填默认值，不执行表达式。
fieldProblem({ type: 'text', id: 'name', label: '名称' }, 'ask 的字段 name');
fieldsProblem(JSON.parse(fieldsJSON), 'ask');
// 一个答复打开后的整组勾选项（静态项已求值、coda:optionList 已展开）。
optionsProblem([{ id: 'release', name: '发布正式版', default: false, inputs: [{ id: 'notes', label: '发布说明' }] }], 'approve 的答复 merge');
// CODA_FIELDS 是同一份 fields.json，也可从 @coda-console/protocol/workflow/fields.json 导入。
```

给 `pointProblem` 的 schema 和这里的并列：可以 `$ref` 协议的 schema（`common.json#/$defs/line40`），可以用五个关键字；它自己写的 `$id` 不算数，指针只指它校验的那份值里的位置。

`TYPES` 是清单 schema 自己校验的通用键（4.0.0 起不含 `agents` 等 Coda 业务键），`SCHEMAS` 是 `schemas/plugin/` 里的全部 schema（按文件名），包括业务键的。协议定义的 schema 在 `schemas/protocol/v1/`，由 `@coda-console/protocol/protocol` 导出。

## 插件的类型

`@coda-console/protocol/types`（`plugin.d.mts`）是插件模块的公开 TypeScript 类型：调用与处理（`Context`、`Handler`、`Caller`）、记录（`Ref`、`KeyRef`、`RecordValue`、`RecordFilter`、`RecordChange`）、页面（`ViewInstance`）和模块里的 `coda` 对象（`Coda`）等。它们属于内部面，随 Coda 的版本可能变。TypeScript 与 `// @ts-check` 的 JSDoc 都能解析（`moduleResolution` 为 `node16`、`nodenext` 或 `bundler`）：

```js
// @ts-check
/** @param {import('@coda-console/protocol/types').Context} ctx */
export async function handle(ctx) {}
```

`./types` 引用了 `node:http` 与 `node:stream` 的类型，用 TypeScript 或 `@ts-check` 做类型检查时，使用方须自己安装 `@types/node`；本包不把它列入 `dependencies`。

## 插件的后端通道

插件清单可以声明 `"coda": { "channels": ["preview"] }`，限定只在预览版后端安装和更新。允许的通道是 `stable`（正式版）和 `preview`（预览版）；数组非空、不重复。不写 `channels` 的插件不限制通道。

清单根上的 `engines.coda` 是插件要的最低 Coda API Level，正整数；不写视为不限。`engines` 里的其余键（如 `node`）照旧不管。这个键在稳定面里，本包只管形状，数字对应哪一版 Coda 由 Coda 定。

宿主按每台目标后端自己的安装记录判断，不按 Mac / iPhone 客户端版本判断；没有通道记录的后端不满足显式限制。商店和直接从 npm、Git 安装执行同一限制。这是 Coda 的安装约束，不改变 npm 包的公开性，也不能约束不认识该字段的旧宿主。

## 输入框模式

从 2.0.0 起，`contributes.composerModes` 可写 `once: true`：这个模式里发出的一条被收下后，它从输入框退出。`once` 是可选布尔值。模式不再接受 `agent`，工具栏始终使用输入框自己的执行者；旧清单须删除模式级的 `agent` 字段。

模式的对象数组参数（`type: array` 且 `items.type: object`）可写 `"presets": { "from": "composer.templates", "by": "template" }`。`from` 是表格设置 ID，`by` 是分组列，两者都是必填字符串，不接受其他字段。此字段只用于模式参数，不用于普通设置。Coda 按输入框所在目录读取设置，以分组列首次出现的顺序显示预设；选中时一次性填入该组的行，只取项中声明的列，之后可普通编辑。进入模式时填入第一组，设置为空则不填。

插件 schema 的 `$id` 命名空间随此不兼容变更升为 `https://coda.pub/schemas/plugin/v2/`；直接写绝对 `$ref` 的调用方须同步更新。Agent 接入和流程方言的 schema 命名空间不变。

## Agent 接入扩展

从 1.9.0 起，[Agent 协议正文](docs/agent-protocol.md#可执行的形状定义)引用 `schemas/agent/` 的可执行定义：
活动报告与停止、上下文压缩、远端入口、双方能力声明、配置探测标记、插话的 Coda 约定、执行失败、工具审核、用量数据和默认选项标记。
`messages.json` 是方向与参数／答复 schema 的索引；ACP 本身仍由 ACP SDK 校验。

```js
import {
  agentMessageProblem, agentResultProblem,
  agentCapabilitiesProblem, agentValueProblem,
  AGENT_METHODS, AGENT_SCHEMAS,
} from '@coda-console/protocol/agent';

agentMessageProblem('_coda/wait', {
  sessionId: 's1', waitId: 'build', state: 'waiting',
}); // null, or "location: schema description"
agentResultProblem('_coda/session/compact', { compacted: true });
agentCapabilitiesProblem({ coda: { waits: {}, compact: {} } }, 'agent');
agentValueProblem('review.json', review, '工具的审核');
```

校验不修改输入。未知扩展键保留；活动文本长度沿用 UTF-16，日期沿用 `Date.parse`（`_coda/quota` 的 `resetsAt` 例外，须是严格的 UTC `date-time`），用量数据按 JSON 的 UTF-8 字节数限制。
深层／大型 JSON 用显式栈检查，非有限数字与循环引用不会通过。会话归属、活动状态迁移、调用起因、协商、超时、重试和授权仍由宿主判断；
丢弃未知风险值、压缩答复的裁剪与兜底等整理也留在 Coda。详见正文的兼容性与接入说明。

## 协议定义与核心协议

从 3.0.0 起，协议是 `命名空间/名字@大版本` + 记录格式（spec、status 的 JSON Schema）+ 操作，见[协议正文](docs/protocol.md)。
插件用 `contributes.protocols` 定义自己命名空间下的协议，用 `contributes.protocolImplementations` 声明实现哪些协议，用根上的 `uses` 申请别的协议的权限组（必需），用 `optionalUses` 声明可选用到的权限组（对应协议或提供方缺席时不阻止插件运行，可用性判定与鉴权由 Coda 宿主负责）；`contributes.optionalProtocolImplementations` 列可选实现的协议（本机没有这个协议时插件照常运行、这一项不生效），`contributes.reservedAccordKinds` 声明只归本插件的 Accord 签名记录种类（命名空间须是插件 ID）；这两个键协议包只校验形状与两条跨键规则（可选实现不与 `protocolImplementations` 重复、保留种类的命名空间等于插件 ID），协议在不在、谁被拒绝由 Coda 宿主判定；
命名空间 `coda` 保留给核心协议。

- **`coda/run@1`**：被调用方自己的运行记录。spec 记录调用的记录、操作、输入、请求 ID、父引用和是否被等待；status 是 `working`、`input-required`、`completed`、`failed`、`canceled`，后三个是终态。`completed`/`failed` 必带 `result`，`failed` 的 `result` 约定为 `{ code, message }`（`code: "unknown"` 表示结局不明），`canceled` 可带取消前的话和留下的东西；另有可选的 `progress` 和等输入时的 `awaiting`。操作是 `cancel`。
- **`coda/agent@1`**：Agent 资源，复数名 `agents`；spec 照 Coda 的 Agent 资源（`agent`、`title`、`plugin?`、`defaultModel`、`models`、`modes` 等），`plugin` 是提供 Agent 程序的插件、不是记录的 provider；status 为空对象；操作 `spawn`（`run: true`）开一个子会话。
- **`coda/session@1`**：插件提供的外部会话。spec 是标题、容器和可选的环境引用；status 是 `head` 游标、参与者（可带头像 `avatar`）与 `post` 收不收语音（`accepts`）；媒体与头像用指针 `{ owner, path, … }` 说内容在哪台后端的哪个地址，读的一方找 Coda 取，旧的 `service`、`path` 写法照收、将退役；操作 `read`（`safe`）与 `draft`（`idempotent`，将退役）是立即结果，`post` 开运行；流 `draft` 是输入框的击键流；撤回、编辑、表情是用 `about` 指向旧消息的新消息。
- **`coda/environment@1`**：插件提供的只读外部环境。spec 带 `actions`；操作 `list` 列目录、`read` 读文件（一次至多 1 MiB）。
- **`coda/resource@1`**：插件持有的一种资源类型在一台机器上的现状，复数名 `resource-types`；一条记录是一台机器上一个插件的一个资源类型，`key` 是类型 ID。spec 是 `{ type, title, resources, signIn? }`；status 是 `{}`；操作 `act`、`sign-in`、`install`。

统一调用是 `{ record: {kind,id}, operation, input, requestId, parent: {kind,id}, awaited }`，回答恰为 `{ result }` 或 `{ run: {kind,id} }` 之一。同一 `requestId` 重发只做一次；慢操作返回运行引用，调用方 watch 运行记录取结果，没有推送或回写。

旧 `executor`、`execution` 对象协议与 `@coda-console/protocol/executor` 在 3.0.0 删除；`contributes.executors` 在 5.16.0 删除。
协议大版本、npm 包版本与插件清单 v2 独立演进；不提供旧格式兼容代码。

## 谁在用

- **Coda**：读插件时用它校验清单，再整理成自己的结构；只另看插件身份（ID、设置名在 ID 之下），以及装到一台机器上才知道的（来源、已装插件的冲突）。读流程时用 `readWorkflow` 同时校验方言、值与结构，再编译成引擎需要的数据。
- **coda-plugins 的契约检查包**（`@coda-console/plugin-check`）：在写插件的地方用同一个校验器判清单。

## 版本

Coda 与检查包都钉一个确切版本。对第三方的兼容承诺只覆盖**稳定面**：第三方实际在用的清单键和页面接口，定义在随 npm 包发布的 [`stable/manifest.json`](stable/manifest.json) 与 [`stable/view.json`](stable/view.json)。稳定面只增不减；要改变或删除承诺，先标弃用，保留过渡时间，不能直接移除定义或破坏现有用法。

其余都是**内部面**，不承诺兼容，删改升次版本。包括未列入稳定面的清单键、模块的 `coda` 对象、`CODA_*` 环境变量、Agent 接入协议、协议定义与流程方言，以及 `coda-view://service/…`。新增可选字段、新类型、放宽限制升次版本。主版本只留给稳定面的不兼容改动；按稳定面只增不减的规矩，这不该发生，真要发生须先标弃用、留过渡时间。协议名里的版本（如 `coda/run@1`）与 npm 包版本、schema 的 `$id` 独立。

两份数据各有从 1 起的整数 `revision`。每项清单以 `path` 标识；`.` 分隔固定键，`[]` 表示数组项，`*` 表示插件自行命名的键。例如 `contributes.configuration.properties.*.additionalProperties.properties.*.format`。`values` 是承诺接受的取值，而非完整枚举。页面文件的成员、事件、根类名、CSS 变量分别列出；`open.targets` 只承诺 `{ view, args }`，`toolbar.fields/kinds` 只承诺列出的字段和种类。

三道检查分别守住：

- `scripts/stable-grows.mjs <基线>`：两份数据的旧条目及其取值必须全部保留，有新增时对应文件的 revision 必须增大，不能倒退。基线可为 git 提交、解包目录或 `npm:latest`。PR 和目标分支比较，发布前下载并解包 npm latest 比较；基线还没有 stable 文件时通过。
- `test/stable.test.mjs`：55 条路径仍在 schema 中可达，承诺的取值仍被接受。使用固定样本选择条件分支，支持 `$ref`、`allOf`、`anyOf`、`if/then/else`、`not`、`properties`、`items`、`additionalProperties` 及布尔 schema；未知写法失败，不推测其含义。`agents`、`commands`、`skills` 从各自的业务 schema 起步。
- `test/third-party.test.mjs`：两版 pi、一版 resource-manager 原文与 company 合成样本，分别跑整份清单和每个贡献键的校验，防止样本用到的约束被收紧。不检查磁盘文件与页面桥行为。这个仓库只守页面接口清单只增不减；页面接口的实现在 Coda 的客户端里，这里不核对。

增加稳定面一项时，先补 schema 或页面实现，再把路径、取值或页面条目加进对应 JSON；每加一项，该文件 revision 加一。补充能覆盖新路径和条件分支的测试样本，运行三道检查，并更新次版本与 CHANGELOG。

协议自己的大版本写在协议名里（`coda/run@1`）；同一大版本只加可选字段和新操作，改含义或删东西升大版本，新旧可并存。

3.0.0 删除了 `executor` 与 `execution`；这是不兼容变更，旧代码须改用 `@coda-console/protocol/protocol` 与 `coda/run@1`。

改协议就在这里开 PR，说明写清动了哪个类型、旧插件受不受影响；发布后 Coda 与检查包各自升依赖。

## 发布

`main` 上版本号变了，`publish.yml` 经 npm 可信发布（OIDC）发出去，不存令牌。第一次发布前，维护者要先占名并配置可信发布：

```sh
npm login
node scripts/publish-npm.mjs --bootstrap
gh workflow run publish.yml --repo coda-console/coda-protocol --ref main
```
