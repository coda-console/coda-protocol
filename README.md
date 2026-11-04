# Coda 协议

Coda 与插件之间的约定，Coda 和插件都引用它，独立演进：

- **插件清单的类型**（`schemas/plugin/`）：插件目录 `package.json` 里 `contributes` 的每个键是一种类型，各有一份 JSON Schema（draft 2020-12，`$id` 为 `https://coda.pub/schemas/plugin/v2/<文件>`）。`plugin.json` 是整份清单，`setting.json` 是一项设置的声明。插件写的合乎它用到的类型就对；写给别的插件扩展点的键由那个插件声明，扩展点可以带自己的 schema（`extensionPoints.<名>.schema`，声明它的插件目录里的一个文件），写给它的东西合乎那份 schema 才对。
- **通用校验器**（`validate.mjs`）：用 Ajv 对清单做 schema 校验。JSON Schema 说不了的只用五个通用关键字（`x-unique-by`、`x-max-contains`、`x-ref`、`x-placeholders`、`x-file`，照 Kubernetes 的 `x-kubernetes-*`），每个在哪里写都是同一个意思，写法见文件开头。校验器不随功能变长：类型加字段就是改 schema。
- **流程方言**（`workflow/`）：项目和插件的流程（`.coda/workflows/*.bpmn`，BPMN 2.0）在 Coda 的命名空间 `https://coda.pub/schema/bpmn/1.0` 里能写什么。`moddle.json` 是 `coda:` 属性与元素（bpmn-moddle 的描述格式），`values.json` 是每个值能写什么（每个 `coda:` 类型的属性组成的对象的 JSON Schema，一个元素里同种 `coda:` 元素成组的 schema），`actions.json` 是 `coda:action` 的各个动作和它们接受的参数，`dialect.json` 是流程种类、Coda 自己发的事件、步骤失败的错误码、表达式能读的运行变量和运行的输入能是哪些类型。`workflow.mjs` 用它们读一份流程：方言里没有的、值不合 schema 的都拒绝，说法是「位置：schema 对那里的说明」。值的 schema 用清单的那几个关键字，另加三个：`x-feel`（是 FEEL：「=」开头是表达式，否则文字里的 `{{ … }}` 是，按这份流程里的名字读得通）、`x-duration`（ISO 8601 时长，不为负）、`x-number`（文字换算成数字是个有限的数）。`structure.json` 声明流程结构规则，`structure.mjs` 负责跨节点检查。
- **Agent 接入扩展**（`schemas/agent/`、`agent.mjs`、`docs/agent-protocol.md`）：Coda 怎样用 ACP 接 Agent，以及 Coda 加的扩展（会话指令、插话、`_coda/wait`、执行失败、工具调用的审核）。

流程方言的 **结构规则**从 1.8.0 起也由 `readWorkflow` / `workflowProblem` 检查。`workflow/structure.json` 声明支持的顶层元素与不支持的流程元素、各位置的事件定义、`coda:` 属性的位置限制、任务与多实例的局部写法、脚本数量、定时间隔和生命周期等待类型。`rules` 使用 JSON Schema 检查节点的无环投影（原始标量属性与父级、事件种类等固定事实），复用 `newAjv()` 和已有关键字；`moddle.json` 的 `extends` 仍声明属性可附着的基础类型。`CODA_STRUCTURE` 导出同一份表。新增局部规则改数据，不增加校验器分支。

`structure.mjs` 的固定检查处理数据表无法单独表达的关系：事件子流程与顺序流、连接事件按作用域配对、事件网关的出口、补偿关联、经过子流程与边界事件的可达性、事件启动以及生命周期的「聋状态」。Coda 的事件名通过 `dialect.json` 的 `eventRoles` 读取；等待动作与节点类型也来自数据表。ISO 8601 重复间隔用 `@0dep/piso` 解析，脚本变量边界用固定的词法扫描检查，条件和 documentation 用同一份 FEEL 检查。图和嵌套树使用显式栈与 Map/Set，不递归、不把大数组展开成函数参数。报错尽量保留 Coda 的原位置与原话。

读取定义时原有的 Coda 结构规则已全部纳入协议。Coda 接入 1.8.0 后，`parseBpmn` 只需调用 `readWorkflow`，再把 `root` 编译成引擎、任务、调度和图所需的结构；运行时才能知道的表达式结果、动态字段引用、调度设置实际值及能力是否存在，仍由宿主在运行时检查。

流程方言的 **卡片字段**由 `workflow/fields.json` 定义：七种字段各能写哪些属性、必填项、文字长度与单行限制、路径与网址、视图参数、输入框与密钥选项；`values.json` 的 `Field` 引用它，`Fields` 声明读出 JSON 字段列表的表达式，`UserTask.children` 限定最多 12 个静态字段、id 不重复，以及全部字段已知时答复的 `fields` 只能引用输入字段（含按住出现的答复）。

定义和运行时共用这一份 schema。`x-deferred` 包住一个 schema：读定义时，文字先检查 FEEL，表达式或含 `{{ … }}` 的模板留到打开任务后查；运行时只按包住的 schema 严格检查，不再把结果当表达式。只有内容属性使用它，`type`、`id`、布尔值、枚举和 `maxLength` 不放宽。另有 `x-length`（沿用 Coda 的 UTF-16 长度，可用 `{ "property": "maxLength" }` 读取同一对象的上限）、`x-json`（解析 JSON 文字或检查 JSON 值，按序列化后的 UTF-8 字节数限制大小）；`absolute-path`、`https-url` 两个 format 按本机路径与 URL 解析器检查。已有的 `x-ref` 增加 `key`（按数组元素的属性引用）和 `split`（逐个检查分隔后的名字）。这些操作都不改写输入。

`fieldProblem(field, where)` 检查一个已求值的字段；`fieldsProblem(fields, where)` 检查展开并应用 `host`/`dir` 后的数组，复用同一份字段 schema、数量和唯一性规则。两者合法时返回 `null`，否则返回「位置：说明」；`where` 是调用方给出的完整位置。schema 的 `default` 仅作标注：默认值填充、去空白、域名转小写、`args` 解析后的保留、表达式求值、动态字段展开和用户答复的处理仍由 Coda 完成。`coda:fields` 的 `host`/`dir` 是可能被覆盖或忽略的备用值，定义时只检查 FEEL，合并后才检查实际字段。动态字段展开后，答复的输入引用仍须由 Coda 检查。

## 用法

```sh
npm install @coda-console/protocol
```

```js
import { manifestProblem, pointProblem, valueProblem, TYPES, SCHEMAS } from '@coda-console/protocol/validate';

// 整份清单；给出插件目录时，连同它点名的文件一起查（x-file）。合乎类型返回 null，否则是一句说明：哪里、schema 怎么说。
const problem = manifestProblem(JSON.parse(readFileSync('plugin/package.json', 'utf8')), 'plugin');
// 某个类型里的一部分，如输入框模式声明的参数。
valueProblem('composer-modes.json#/$defs/parameters', parameters, '插件给出的参数');
// 写给别的插件扩展点的东西，按那个扩展点的 schema（已读出的对象）；给出写它的插件目录时连同它点名的文件一起查。
pointProblem(panelsSchema, manifest.contributes.panels, 'contributes.panels', 'plugin');
```

```js
import { workflowProblem, readWorkflow, fieldProblem, fieldsProblem, CODA_FIELDS } from '@coda-console/protocol/workflow';

// 一份流程（名字不带 .bpmn，用在说明里）：方言里都有就返回 null，否则是一句说明。
const problem = await workflowProblem(readFileSync('.coda/workflows/deploy.bpmn', 'utf8'), 'deploy');
// 要接着读它的：{ root } 是解析好的 definitions，或 { problem }。
const { root } = await readWorkflow(source, 'deploy');
// 任务打开、接受答复时检查已求值的字段，不填默认值，不执行表达式。
fieldProblem({ type: 'text', id: 'name', label: '名称' }, 'ask 的字段 name');
fieldsProblem(JSON.parse(fieldsJSON), 'ask');
// CODA_FIELDS 是同一份 fields.json，也可从 @coda-console/protocol/workflow/fields.json 导入。
```

扩展点的 schema 和这里的并列：可以 `$ref` 协议的 schema（`common.json#/$defs/line40`），可以用五个关键字；它自己写的 `$id` 不算数，指针只指它校验的那份值里的位置。

`TYPES` 是 Coda 自己的类型（`contributes` 的键），`SCHEMAS` 是全部 schema（按文件名）。

## 插件的后端通道

插件清单可以声明 `"coda": { "channels": ["preview"] }`，限定只在预览版后端安装和更新。允许的通道是 `stable`（正式版）和 `preview`（预览版）；数组非空、不重复。不写 `channels` 的插件不限制通道。

宿主按每台目标后端自己的安装记录判断，不按 Mac / iPhone 客户端版本判断；没有通道记录的后端不满足显式限制。商店和直接从 npm、Git 安装执行同一限制。这是 Coda 的安装约束，不改变 npm 包的公开性，也不能约束不认识该字段的旧宿主。

## 项目中的多选选项

设置的 `items.anyOf` 选项可附带 `workflowKind`（`check`、`premerge`、`deploy`、`preview`、`release`）。全局设置显示全部选项；项目设置只显示该项目有的流程类别，未写此字段的选项始终显示。宿主负责按项目提供可选项，流程执行时仍需按运行的提交判断可用操作。

## 输入框模式

从 2.0.0 起，`contributes.composerModes` 可写 `once: true`：这个模式里发出的一条被收下后，它从输入框退出。`once` 是可选布尔值。模式不再接受 `agent`，工具栏始终使用输入框自己的执行者；旧清单须删除模式级的 `agent` 字段。

模式的对象数组参数（`type: array` 且 `items.type: object`）可写 `"presets": { "from": "composer.templates", "by": "template" }`。`from` 是表格设置 ID，`by` 是分组列，两者都是必填字符串，不接受其他字段。此字段只用于模式参数，不用于普通设置。Coda 按输入框所在目录读取设置，以分组列首次出现的顺序显示预设；选中时一次性填入该组的行，只取项中声明的列，之后可普通编辑。进入模式时填入第一组，设置为空则不填。

插件 schema 的 `$id` 命名空间随此不兼容变更升为 `https://coda.pub/schemas/plugin/v2/`；直接写绝对 `$ref` 的调用方须同步更新。Agent 接入和流程方言的 schema 命名空间不变。

## Agent 接入扩展

从 1.9.0 起，[Agent 协议正文](docs/agent-protocol.md#可执行的形状定义)引用 `schemas/agent/` 的可执行定义：
活动报告与停止、上下文压缩、远端入口、双方能力声明、插话的 Coda 约定、执行失败、工具审核、用量数据和默认选项标记。
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

校验不修改输入。未知扩展键保留；活动文本长度沿用 UTF-16，日期沿用 `Date.parse`，用量数据按 JSON 的 UTF-8 字节数限制。
深层／大型 JSON 用显式栈检查，非有限数字与循环引用不会通过。会话归属、活动状态迁移、调用起因、协商、超时、重试和授权仍由宿主判断；
丢弃未知风险值、压缩答复的裁剪与兜底等整理也留在 Coda。详见正文的兼容性与接入说明。

## 运行器与执行请求

从 2.1.0 起，`executor` 与 `execution` 是 Coda 预定公共对象协议，见[运行器协议正文](docs/executor-protocol.md)。
`schemas/executor/v1/` 使用默认 Ajv 可读的 draft-07；`@coda-console/protocol/executor` 导出
`EXECUTOR_PROTOCOL`、`EXECUTION_PROTOCOL`，其 spec/status 都自包含，可直接传给 `protocols.define`。
2.2.0 支持无资源请求或一个资源的一单位（slots 或本机 `group:<原名>`），可独占申请资源；仍不支持多单位或多资源原子申请。
可选 placement 是生产者的位置／指定环境硬约束，context 是受控运行上下文与输出声明；执行器须显式声明支持新能力。
流程可在 process、subProcess、scriptTask 写 `coda:placement="local|any"`，祖先 local 不可被子节点放宽。两种类型均无补充栏，execution 绑定是由调度办事员 CAS 更新的单值。
executor 无 target，status 由持有端写；execution 绑定后由执行方完整回传，开跑前须经本机账本准入。
对象协议 v1 与 npm 包版本、插件清单 v2 独立；旧 `contributes.executors` 不变。

## 谁在用

- **Coda**：读插件时用它校验清单，再整理成自己的结构；只另看插件身份（ID、设置名在 ID 之下），以及装到一台机器上才知道的（来源、已装插件的冲突）。读流程时用 `readWorkflow` 同时校验方言、值与结构，再编译成引擎需要的数据。
- **coda-plugins 的契约检查包**（`@coda-console/plugin-check`）：在写插件的地方用同一个校验器判清单。

## 版本

按 semver，Coda 与检查包都钉一个确切版本：

- 只加东西（新的可选字段、新的类型、放宽限制）升次版本；
- 改名、删除、收紧（旧的清单会变得不合）升主版本，`$id` 里的 `v1` 随之变成 `v2`。

改协议就在这里开 PR，说明写清动了哪个类型、旧插件受不受影响；发布后 Coda 与检查包各自升依赖。

## 发布

`main` 上版本号变了，`publish.yml` 经 npm 可信发布（OIDC）发出去，不存令牌。第一次发布前，维护者要先占名并配置可信发布：

```sh
npm login
node scripts/publish-npm.mjs --bootstrap
gh workflow run publish.yml --repo coda-console/coda-protocol --ref main
```
