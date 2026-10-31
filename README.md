# Coda 协议

Coda 与插件之间的约定，Coda 和插件都引用它，独立演进：

- **插件清单的类型**（`schemas/plugin/`）：插件目录 `package.json` 里 `contributes` 的每个键是一种类型，各有一份 JSON Schema（draft 2020-12，`$id` 为 `https://coda.pub/schemas/plugin/v1/<文件>`）。`plugin.json` 是整份清单，`setting.json` 是一项设置的声明。插件写的合乎它用到的类型就对；写给别的插件扩展点的键由那个插件声明，扩展点可以带自己的 schema（`extensionPoints.<名>.schema`，声明它的插件目录里的一个文件），写给它的东西合乎那份 schema 才对。
- **通用校验器**（`validate.mjs`）：用 Ajv 对清单做 schema 校验。JSON Schema 说不了的只用五个通用关键字（`x-unique-by`、`x-max-contains`、`x-ref`、`x-placeholders`、`x-file`，照 Kubernetes 的 `x-kubernetes-*`），每个在哪里写都是同一个意思，写法见文件开头。校验器不随功能变长：类型加字段就是改 schema。
- **流程方言**（`workflow/`）：项目和插件的流程（`.coda/workflows/*.bpmn`，BPMN 2.0）在 Coda 的命名空间 `https://coda.pub/schema/bpmn/1.0` 里能写什么。`moddle.json` 是 `coda:` 属性与元素（bpmn-moddle 的描述格式），`values.json` 是每个值能写什么（每个 `coda:` 类型的属性组成的对象的 JSON Schema，一个元素里同种 `coda:` 元素成组的 schema），`actions.json` 是 `coda:action` 的各个动作和它们接受的参数，`dialect.json` 是流程种类、Coda 自己发的事件、步骤失败的错误码、表达式能读的运行变量和运行的输入能是哪些类型。`workflow.mjs` 用它们读一份流程：方言里没有的、值不合 schema 的都拒绝，说法是「位置：schema 对那里的说明」。值的 schema 用清单的那几个关键字，另加三个：`x-feel`（是 FEEL：「=」开头是表达式，否则文字里的 `{{ … }}` 是，按这份流程里的名字读得通）、`x-duration`（ISO 8601 时长，不为负）、`x-number`（文字换算成数字是个有限的数）。流程的结构对不对（元素与事件、连接、补偿、走不到的步骤、事件启动），现在仍由 Coda 读流程时检查。
- **Agent 接入协议**（`docs/agent-protocol.md`）：Coda 怎样用 ACP 接 Agent，以及 Coda 加的扩展（会话指令、插话、`_coda/wait`、执行失败、工具调用的审核）。

## 用法

```sh
npm install @coda-console/protocol
```

```js
import { manifestProblem, pointProblem, valueProblem, TYPES, SCHEMAS } from '@coda-console/protocol/validate';

// 整份清单；给出插件目录时，连同它点名的文件一起查（x-file）。合乎类型返回 null，否则是一句说明：哪里、schema 怎么说。
const problem = manifestProblem(JSON.parse(readFileSync('plugin/package.json', 'utf8')), 'plugin');
// 某个类型里的一部分，如输入框模式的参数（插件运行时给出的）。
valueProblem('composer-modes.json#/$defs/parameters', parameters, '插件给出的参数');
// 写给别的插件扩展点的东西，按那个扩展点的 schema（已读出的对象）；给出写它的插件目录时连同它点名的文件一起查。
pointProblem(panelsSchema, manifest.contributes.panels, 'contributes.panels', 'plugin');
```

```js
import { workflowProblem, readWorkflow, CODA_MODDLE, CODA_ACTIONS } from '@coda-console/protocol/workflow';

// 一份流程（名字不带 .bpmn，用在说明里）：方言里都有就返回 null，否则是一句说明。
const problem = await workflowProblem(readFileSync('.coda/workflows/deploy.bpmn', 'utf8'), 'deploy');
// 要接着读它的：{ root } 是解析好的 definitions，或 { problem }。
const { root } = await readWorkflow(source, 'deploy');
```

扩展点的 schema 和这里的并列：可以 `$ref` 协议的 schema（`common.json#/$defs/line40`），可以用五个关键字；它自己写的 `$id` 不算数，指针只指它校验的那份值里的位置。

`TYPES` 是 Coda 自己的类型（`contributes` 的键），`SCHEMAS` 是全部 schema（按文件名）。

## 插件的后端通道

插件清单可以声明 `"coda": { "channels": ["preview"] }`，限定只在预览版后端安装和更新。允许的通道是 `stable`（正式版）和 `preview`（预览版）；数组非空、不重复。不写 `channels` 的插件不限制通道。

宿主按每台目标后端自己的安装记录判断，不按 Mac / iPhone 客户端版本判断；没有通道记录的后端不满足显式限制。商店和直接从 npm、Git 安装执行同一限制。这是 Coda 的安装约束，不改变 npm 包的公开性，也不能约束不认识该字段的旧宿主。

## 项目中的多选选项

设置的 `items.anyOf` 选项可附带 `workflowKind`（`check`、`premerge`、`deploy`、`preview`、`release`）。全局设置显示全部选项；项目设置只显示该项目有的流程类别，未写此字段的选项始终显示。宿主负责按项目提供可选项，流程执行时仍需按运行的提交判断可用操作。

## 谁在用

- **Coda**：读插件时用它校验清单，再整理成自己的结构；只另看插件身份（ID、设置名在 ID 之下），以及装到一台机器上才知道的（来源、已装插件的冲突）。读流程时先用 `readWorkflow` 按方言解析，再查每个值。
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
