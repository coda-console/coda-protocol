# 协议定义、调用与核心协议 v1

从 3.0.0 起，协议不再只是插件清单里的一组类型：一份协议有名字、记录格式和操作，插件可以定义自己的协议，也可以声明实现别人的协议。调用一条记录的操作只交给这条记录的 provider；被调用方在自己的 `coda/run@1` 记录里报告运行，调用方 watch 它，不再由调用方或被点名的一方写别人的 status。

本包定义：

- 协议定义文档的 JSON Schema 与校验：`schemas/protocol/v1/definition.json`、`@coda-console/protocol/protocol`；
- 统一调用信封：`schemas/protocol/v1/request.json`、`response.json`；
- 六个核心协议：`coda/run@1`、`coda/executor@1`、`coda/agent@1`、`coda/session@1`、`coda/environment@1`、`coda/card@1`；
- 插件清单里的 `contributes.protocols` 与 `contributes.protocolImplementations`。

`executor` 与 `execution` 两个旧对象协议和 `@coda-console/protocol/executor` 在 3.0.0 删除；`execution` 的输入并入 `coda/executor@1` 的 `execute` 操作，运行由 `coda/run@1` 表达。

## 名字

协议名是 `命名空间/名字@大版本`：

- 命名空间与名字只用小写字母、数字和「-」。命名空间以小写字母开头，长度 1–40；名字以小写字母或数字开头，长度 1–40。
- 大版本是正整数，写在 `@` 后面。
- 短名至多 63 个字符（Kubernetes CRD 复数名的 DNS-1035 标签上限）；超过的协议名不合法。协议名本身最多 61 个字符，带 `-` 的名字按展开后的短名再检查。
- 插件只能在自己的命名空间下定义协议；命名空间就是插件 ID。命名空间 `coda` 保留给核心协议。
- 同一大版本内只加可选字段、新操作；改含义、删字段或删操作就升大版本。新旧大版本可以并存，由实现声明支持哪个。

```js
import { parseProtocolName, formatProtocolName, protocolNameProblem } from '@coda-console/protocol/protocol';

parseProtocolName('coda/run@1'); // { namespace: 'coda', name: 'run', major: 1 }
formatProtocolName({ namespace: 'my-plugin', name: 'task', major: 1 }); // 'my-plugin/task@1'
protocolNameProblem('My/run@1'); // 说明哪里不合
```

### 短名

给存储表、Kubernetes CRD 的复数名（`<复数>.<group>` 里的 `<复数>`）和变化流 section 用同一个确定、DNS 安全的短名。Kubernetes CRD 的复数名须是 DNS-1035 标签，至多 63 个字符，因此短名也限制在 63 个字符以内；超过的协议名不合法，不截断也不哈希。推导规则只有三条替换：

| 协议名里的字符 | 短名里写成 |
| --- | --- |
| 字面 `-` | `-0` |
| 命名空间与名字之间的 `/` | `-1` |
| 版本前的 `@` | `-2` |

其余小写字母和数字原样保留。例：

| 协议名 | 短名 |
| --- | --- |
| `coda/run@1` | `coda-1run-21` |
| `my-plugin/tool@2` | `my-0plugin-1tool-22` |
| `a-/b-@9` | `a-0-1b-0-29` |

因为原协议名里的每个 `-` 都变成 `-0`，短名里出现的每个 `-` 都开始一次替换：`-0` 还原为 `-`，`-1` 还原为 `/`，`-2` 还原为 `@`，再按协议名解析。替换是前缀码，一种协议名只对应一个短名，一个短名也只对应一种协议名。短名只含小写字母、数字和 `-`，以命名空间的字母开头、以大版本的数字结尾，最长 63 个字符；`parseProtocolName` 和 `definitionProblem` 会按展开后的实际长度拒绝超长的协议名。

```js
import { protocolShortName } from '@coda-console/protocol/protocol';

protocolShortName('coda/run@1'); // 'coda-1run-21'
```

### 复数名

定义可以写 `plural`，给人寻址用的复数名，和 Kubernetes CRD 的 `names.plural` 同一个位置：引用 `coda://<复数名>/<ID>`、资源列表的种类、节点内核 CRD 的复数名都用它。不写就是协议的短名。写法是小写字母开头，只用小写字母、数字和「-」，至多 63 个字符（`^[a-z][a-z0-9-]{0,62}$`）。

复数名是协议的一部分：同一大版本内不可改，改名等于新协议。核心协议之间的复数名（不写的按短名算）互不相同，本包的自测会拦下重复的。`coda/agent@1` 写 `"plural": "agents"`，所以 Agent 的引用仍是 `coda://agents/<ID>`。

## 定义文档

一份定义是一个 JSON 对象：

| 字段 | 含义 |
| --- | --- |
| `name` | 协议名，必填 |
| `title` | 给人看的名字，可选 |
| `description` | 一句话说明，可选 |
| `plural` | 复数名（见「复数名」），可选；不写就是短名 |
| `spec` | 记录的 spec 的 JSON Schema，必填 |
| `status` | 记录的 status 的 JSON Schema，必填 |
| `operations` | 操作名 → `{ description?, input, result, safe?, idempotent? }` 或 `{ description?, input, run: true }`，必填；不定义操作写 `{}` |

`spec`、`status`、`input`、`result` 都是 JSON Schema draft 2020-12，只引用自己文档里的 `#/$defs/...`，不引用别的文件。`input` 必有。操作的输出二选一：

- `result`：立即返回结果的 schema；
- `run: true`：返回一个运行引用，运行记录由被调用方持有。

`safe: true` 只能和 `result` 一起写，不能和 `run` 一起写，表示只读、没有副作用、立即给结果的操作；调用方和被调用方都不按 `requestId` 留它的请求和回答（见「调用信封」）。

`idempotent: true` 也只能和 `result` 一起写，不能和 `run` 一起写，表示可以改状态、但重发做的是同一件事的立即结果操作，比如把草稿设成某一段：调用双方和 `safe` 一样，都不按 `requestId` 留请求和回答。两者是 HTTP 的 safe 与 idempotent 之分：`safe` 只读，`idempotent` 可以改状态。`safe` 已含 `idempotent`，两个不同时写。

```json
{
  "name": "my-plugin/task@1",
  "title": "任务",
  "spec": {
    "type": "object",
    "properties": {"title": {"type": "string"}},
    "required": ["title"],
    "additionalProperties": false
  },
  "status": {
    "type": "object",
    "properties": {"state": {"enum": ["working", "done"]}},
    "required": ["state"],
    "additionalProperties": false
  },
  "operations": {
    "start": {
      "input": {
        "type": "object",
        "properties": {"title": {"type": "string"}},
        "required": ["title"],
        "additionalProperties": false
      },
      "run": true
    },
    "peek": {
      "input": {"type": "object", "maxProperties": 0},
      "result": {
        "type": "object",
        "properties": {"title": {"type": "string"}},
        "required": ["title"],
        "additionalProperties": false
      },
      "safe": true
    }
  }
}
```

```js
import { definitionProblem } from '@coda-console/protocol/protocol';

definitionProblem(definition); // null，或「位置：说明」
definitionProblem(definition, { namespace: 'my-plugin' }); // 同时核对命名空间
```

## 调用信封

记录引用 `{ kind, id }` 的 `kind` 是协议名，如 `coda/run@1`、`coda/executor@1`、`git/snapshot@1`、`git/source@1`；`id` 是记录的不透明 ID。Coda 自己还没定义成协议的东西（会话、流程运行等）暂用它现有的资源种类名，如 `threads`、`workflow-runs`，等后续定义成协议再改用协议名。

一次调用是：

```json
{
  "record": {"kind": "coda/executor@1", "id": "host"},
  "operation": "execute",
  "input": {"task": {"command": "npm", "args": ["test"]}},
  "requestId": "request-1",
  "parent": {"kind": "coda/run@1", "id": "caller-run"},
  "awaited": true
}
```

`parent` 是发起这次调用的一方（调用方的运行、会话或其他记录），`awaited` 表示调用方是否在等它。被调用方建运行时把这两项照抄进 `coda/run@1` 的 spec。

回答二选一：

```json
{"result": {"accepted": true}}
```

```json
{"run": {"kind": "coda/run@1", "id": "run-1"}}
```

`requestId` 由调用方给，重发同一个请求只做一次。`safe` 与 `idempotent` 的操作例外：调用双方都不按 `requestId` 留请求和回答，重发就再做一次。`safe` 读回来的是对方的数据，比如群消息、环境里的文件内容，留在调用双方的库里就成了镜像；`idempotent` 重做一遍结果相同，留着也没用。立即结果用 `result`；慢的操作用 `run` 指向被调用方自己的 `coda/run@1` 记录，调用方 watch 这条记录取结果，被调用方不推送。取消也是一次调用（`coda/run@1` 的 `cancel` 操作），不是写别人的记录。

```js
import { invocationRequestProblem, invocationResponseProblem } from '@coda-console/protocol/protocol';

invocationRequestProblem(request);   // null 或说明
invocationResponseProblem(response); // 恰好有 result 或 run 之一
```

## 插件清单

```json
{
  "id": "my-plugin",
  "contributes": {
    "protocols": [
      {"name": "my-plugin/task@1", "spec": {}, "status": {}, "operations": {}}
    ],
    "protocolImplementations": ["coda/run@1", "my-plugin/task@1"]
  }
}
```

`contributes.protocols` 是插件拥有的定义，每份都按定义文档 schema 校验；定义里的命名空间必须等于插件 ID。`contributes.protocolImplementations` 是插件实现的协议名列表，可以包含别的命名空间下的协议（包括 `coda/...`），不重复。

`manifestProblem` 校验清单的外壳与通用键（这两个键在其中）；别的键由 Coda 的贡献点登记表或某个插件的扩展点声明，按声明方的 schema 校验，本包不管它们的形状。命名空间约束需要插件 ID，单独用：

```js
import { ownedProtocolsProblem } from '@coda-console/protocol/protocol';

ownedProtocolsProblem(manifest); // null 或说明
```

## coda/run@1

被调用方为一次调用开出的运行记录，由被调用方持有和写入。调用方 watch 它取结果；它不会被复制回调用方的记录。

spec：

| 字段 | 含义 |
| --- | --- |
| `record` | 调用的是哪条记录，`{ kind, id }` |
| `operation` | 操作名 |
| `input` | 原样保存的输入 |
| `requestId` | 调用方的请求 ID |
| `parent` | 谁让它存在：发起它的记录引用，必填 |
| `awaited` | 父是否在等它，布尔 |

`parent` 与 `awaited` 来自调用请求，被调用方建运行时照抄这两项。

status：

| 字段 | 含义 |
| --- | --- |
| `state` | `working`、`input-required`、`completed`、`failed`、`canceled`；后三个是终态 |
| `result` | 完成、失败或取消时的结果：`completed`/`failed` 必带；`canceled` 可带取消前说过的话和留下的东西；`working`/`input-required` 不带 |
| `progress` | 进展说明，可选 |
| `awaiting` | 等输入时那张卡片的引用，指向一条 `coda/card@1`；`input-required` 必填，其他状态不写 |

`failed` 的 `result` 约定为 `{ code, message }`。`code: "unknown"` 表示结局不明（例如执行连接中断），调用方据此显示「结果未知」，不当作失败。

终态是最后的写入：`runStatusProblem(previous, next)` 在 `previous` 已是终态时返回说明，同一状态再写也不行。进行中的状态可以互相转换（`working` 与 `input-required`），也可以进入任一终态。

操作 `cancel` 的输入是空对象，立即返回空结果；是否真的停下看 status。

操作 `answer` 回答运行在等的那张卡片，立即返回 `{ state? }`，运行接着怎样看 status。输入是 `{ card, answer, answeredBy?, attachments? }`：`card` 须等于 `status.awaiting`；`answer` 是对象，形状由卡片种类定；`answeredBy` 是代答的会话，用户答时不写；`attachments` 是随答案带的上传文件 ID（至多 20 个）。它标 `idempotent`：答案里可能有密钥原文，调用双方都不按 `requestId` 保存这次调用；重复提交由持有者按卡片挡住。

`cancel` 和 `answer` 都交给运行的持有者处理：被调用方按 `spec.record.kind` 找到持有这条运行的一方。

```json
{
  "spec": {
    "record": {"kind": "coda/executor@1", "id": "host"},
    "operation": "execute",
    "input": {"task": {"command": "npm", "args": ["test"]}},
    "requestId": "request-1",
    "parent": {"kind": "coda/run@1", "id": "parent-run"},
    "awaited": true
  },
  "status": {"state": "working", "progress": "准备中"}
}
```

## coda/executor@1

一台机器上的执行环境。记录格式取自 3.0.0 之前的 `executor`，版本改由协议名表达，spec 不再写 `protocolVersion`：spec 是 `enabled`、`capacity`、`labels` 和可选的 `title`；status 是探测到的标签、能力、容量与占用、`accepting`、观察时间和 `executionFeatures`。空 status `{}` 表示尚未观察到。

操作 `execute` 的输入是一份执行工作：`source`、`requirements`、`resources`、`exclusiveResources`、`context`、`task`、`workingDirectory`、`env`、`timeoutMs`、`cancelGraceMs`。它返回 `{ run: { kind, id } }`，运行记录由执行器持有。不再有 `target`、`executor` 或 `assignmentId` 绑定，也不回写调用方的记录；取消走运行记录的 `cancel` 操作。

```json
{
  "spec": {"enabled": true, "capacity": {"slots": 2}, "labels": ["build-lab"], "title": "Mac mini"},
  "status": {}
}
```

## coda/agent@1

一台机器上装着的 Agent 程序，记录格式照 Coda 的 Agent 资源 spec。复数名是 `agents`。记录的 provider 是写记录的一方，即编排（现在是 `coda`），不是提供 Agent 程序的插件；那个插件写在 `spec.plugin`。

| 字段 | 含义 |
| --- | --- |
| `agent` | Agent 的 ID，必填 |
| `title` | 给人看的名字 |
| `plugin` | 提供这个 Agent 程序的插件 ID，可选 |
| `defaultModel` | 不指定模型时用的模型 ID；读到目录前为空 |
| `models` | `[{ id, name?, shortName?, group?, efforts, options }]` |
| `modes` | `[{ id, name?, shortName? }]` |

`models[].efforts` 是 `[{ id, name?, shortName? }]`；`models[].options` 是 `{ id, name?, shortName?, type: "boolean"|"select", choices? }`，`select` 带 `choices`，`boolean` 不带。status 是空对象。

操作 `spawn`（`run: true`）：在这台机器上用这个 Agent 开一个子会话，返回运行引用。输入是 `{ projectId, threadId, title, text, settings?, checkout?, parentTitle, parentUnattended }`：子会话所在的项目与工作树（`checkout`）、Agent 的设置（`settings`，如模型与推理强度）、标题与第一条任务（`text`）；`threadId` 是调用方给的子会话 ID，重试找到的是同一个；`parentTitle` 是发起方在这里显示的名字，`parentUnattended` 说发起方是否无人值守。子会话为谁工作由调用信封的 `parent` 说，不写在输入里；`parent` 不是会话、是登记过的调用方记录时，开的是顶层会话，不是子会话。

```json
{
  "spec": {
    "agent": "codex",
    "title": "Codex",
    "plugin": "codex",
    "defaultModel": "gpt-5",
    "models": [{"id": "gpt-5", "efforts": [], "options": []}],
    "modes": [{"id": "auto", "name": "自动"}]
  },
  "status": {}
}
```

## coda/session@1

插件提供的外部会话，比如一个微信群：参与者、消息、草稿和发消息。

spec：

| 字段 | 含义 |
| --- | --- |
| `title` | 给人看的名字 |
| `container` | `{ id, title }`：Provider 给的容器，例如插件登录的微信号；列表按 provider 与 `container.id` 分组 |
| `environment` | 可选，`{ kind: "coda/environment@1", id }`：外部会话自带的环境 |

status：

| 字段 | 含义 |
| --- | --- |
| `head` | 最新一条消息的游标，不透明；Provider 每追加一条就写，还没有消息时不写 |
| `participants` | `[{ id, name, kind: "person"\|"agent"\|"bot", self? }]`；`self: true` 是这个 Provider 登录的账号，即 Coda 的 Bot |
| `state` | 可选，`active` 或 `unreachable` |
| `reason` | 可选，状态说明 |
| `accepts` | 可选，`post` 除文字以外还收哪些媒体 part，见下 |

`accepts` 是一个对象，键是媒体 part 的 `type`，值是这一类型的限制，没有限制就写 `{}`。本版本只有 `audio` 一个键，以后要收别的类型再加键：

| 键 | 值 |
| --- | --- |
| `audio` | `{ maxDuration? }`：收 `upload` 引用的语音；`maxDuration` 是一条语音最长多少秒，大于 0 |

不写 `accepts` 就是只收文字。客户端据此决定显示不显示录音入口，录音时到 `maxDuration` 自动停止。放在 status 而不在 spec，是因为 Provider 的能力可能随状态变化，例如手机上的麦克风权限被收回。

```json
{"participants": [], "accepts": {"audio": {"maxDuration": 60}}}
```

观察方 watch 这条记录，`head` 变了就用 `read` 读游标之后的消息。`read` 与 `draft` 是立即结果，`read` 是 `safe` 的，`draft` 是 `idempotent` 的；`post` 开运行：

- `read`：输入 `{ after?, before?, limit? }`，`after`、`before` 是游标，`limit` 为 1 到 100；结果 `{ messages, cursor, more }`，没有消息时 `cursor` 为 `null`。`messages` 总按先后排，旧的在前：
  - 都不带游标：最新的 `limit` 条，`more` 表示更早还有没有；客户端打开会话时先读这一页；
  - 只带 `after`：这个游标之后的，`more` 表示之后还有没有；
  - 只带 `before`：这个游标之前最新的 `limit` 条，`more` 表示更早还有没有；往前翻页就拿这一页第一条的 `cursor` 作下一次的 `before`；
  - `after` 与 `before` 不能同时带。
- `post`（`run: true`）：输入 `{ text, parts?, replyTo?, mentions? }`，以 `self` 发一条消息。发一条可能要十几秒到几十秒（排队、按真人节奏输入、发出后确认），所以开运行：
  - 发送者固定是 `self`；重发同一个 `requestId`，得到的是同一个运行，只发一次；
  - 运行 `completed` 时，`result` 是 `{ message: { id, cursor } }`，就是以后 `read` 会读到的那条消息；
  - 发送失败时运行为 `failed`，`result` 是 `{ code, message }`；不确定发没发出去时（例如输入到一半进程没了）`code` 为 `unknown`，调用方显示「结果未知」，不自动重发；
  - 输入里有 `status.accepts` 没声明的媒体 part，或超出它声明的限制（比如语音长过 `maxDuration`）时，运行 `failed`，`code` 为 `unsupported`；
  - 输入里的媒体 part 可以用 `upload` 引用记录持有方的上传，见下；
  - 取消沿用 `coda/run@1` 的 `cancel`：还没开始发的停下，得到 `canceled`；已经开始发的，Provider 可以不停，是否停下看 status；
  - 全文总在 `post` 的输入里；没有先写过草稿的 `post` 也照常发出去。
- `draft`（`idempotent`）：设定 `self` 在这个会话里还没发出去的文字，结果 `{}`。输入 `{ text, version, steps? }`：
  - `text` 是当前草稿的全文，至多 65536 个字符；空串表示清空或放弃；
  - `version` 是调用方给的非负整数版本号，比大小：Provider 收到不大于已见最大版本的直接丢掉，多台设备都在写时后写的为准；建议用毫秒时间；
  - `steps` 可选，至多 1000 项，是从上一版到这一版之间按先后排的中间状态 `{ text, delayMs }`：每一步的全文，以及距上一步的间隔（毫秒，0 到 600000）；Provider 可以照这个节奏回放，最后一步等于 `text`；
  - Provider 可以把草稿同步到对方平台的输入框，用户发出时那边基本已经打完；用不上草稿的 Provider 直接答 `{}`。

消息是 `{ id, cursor, sender, senderName?, text, parts?, replyTo?, mentions?, about?, createdAt? }`：

- `sender` 与 `mentions` 写参与者 ID，`replyTo` 写消息 ID；
- `senderName` 是发送者当时的显示名，可选：大群不必把每个发送者都写进 `status.participants`；
- 回复一条消息就算 @ 了它的发送者，Provider 把被回复消息的发送者也写进 `mentions`：只有 Provider 知道被回复的那条是谁发的，观察方不用记住 Bot 发过哪些消息；
- `text` 是纯文本兜底，看不懂 `parts` 的一方只看它；
- 撤回、编辑、表情回应都是一条新消息，`about: { message, change: "edit"|"recall"|"reaction", value? }` 指向旧消息；
- `createdAt` 只供显示，顺序看 `cursor`。

`parts` 的每一项是下面之一：

- `{ type: "text", text }`；
- `{ type: "image"|"video"|"file"|"audio", name, size?, mime?, width?, height?, duration?, thumb?, service?, path?, preview?, upload? }`：媒体，大文件只给引用，字段见下；
- `{ type: "thinking"|"tool", text }`。

媒体 part 在 `read` 的消息和 `post` 的输入里是同一种形状，只有 `upload` 只在 `post` 的输入里有；`type`、`name` 以外都可选：

| 字段 | 含义 |
| --- | --- |
| `name`、`size`、`mime` | 文件名、字节数、MIME 类型 |
| `width`、`height` | 像素，整数，至少 1，已按拍摄方向转正；图片和视频用 |
| `duration` | 时长，秒，不为负；视频和语音用 |
| `thumb` | 内嵌 JPEG 的 base64（不带 `data:` 前缀），至多 8192 个字符；视频用封面帧 |
| `service` | provider 插件登记的本机流式服务 ID |
| `path` | 原文件的服务内路径，1 到 2048 个字符 |
| `preview` | 预览图的服务内路径，在同一个 `service` 里，1 到 2048 个字符 |
| `upload` | 只在 `post` 的输入里：持有这条记录的机器上 Coda 上传的 ID（那台机器 `POST /v1/uploads` 返回、`GET /v1/uploads/<id>` 能读回的），1 到 200 个字符 |

有 `path` 或 `preview` 就必须有 `service`。`upload` 与 `service`、`path`、`preview` 互斥：一个媒体 part 要么引用 Provider 自己的服务，要么引用持有方的上传。

`audio` 是一段语音消息，即对方平台的「语音条」，不是任意音频文件：

- 用 `name`、`size`、`mime`、`duration`、`service`、`path`（`post` 里也可以是 `upload`）；`width`、`height`、`thumb`、`preview` 对它没有意义，不用；
- `path` 给出的文件应当是常见播放器能直接播放的格式（如 AAC/M4A、MP3、WAV），`mime` 写实际给出的格式；对方平台的原始编码不能直接播时，由 Provider 转换；
- 观察方看不懂 `audio` 时照常退回 `text`：Provider 给语音消息写一个可读的 `text` 兜底，例如「[语音] 5″」，具体写法由 Provider 定。

发语音时，调用方先把录好的文件传到记录的持有方（`POST /v1/uploads`），再在 `post` 里用 `upload` 引用；持有方的 Coda 负责把上传交给 Provider 读取，Provider 不经网络取。本版本 `upload` 只要求 Provider 对 `audio` 支持，其他类型以后再说。

一个媒体分三档，从小到大：

- **`thumb`**：内嵌在消息里，框一出现就能画。约束只是至多 8192 个字符：自己生成时长边取 64 像素左右；Provider 手上已有的小缩略图，只要在上限以内，可以原样放进来。
- **`preview`**：持有方本地就有的较小版本。图片是一张静图，长边一般不超过约 1280 像素；视频是封面帧。观察方在会话里画它，原图只在打开时取。
- **`path`**：原文件。

尺寸和 `thumb` 让框在图到达前就是最终大小：先显示放大、模糊的 `thumb`，`preview` 到了在原地换上；没有 `preview` 的，照旧换上原图。
观察方读记录持有方的 `/v1/plugins/<provider 插件>/services/<service>/<preview 或 path>`（别的机器经空间到达持有方）；路径原样接在后面，Provider 写它时就按 URL 路径编码好，不以 `/` 开头。
字节、Range 和流中断语义沿用 Coda 的本机流式服务。

取不到时这样降级：

- 取 `path` 回 404 而有 `preview`：显示预览图，并注明原图不在持有方（比如微信还没下载），不当成「文件已清理」；
- 没有 `preview` 或 `preview` 也取不到：退回 `thumb`；
- 三档都没有或都取不到：显示文件卡。

缺字段时这样降级，旧消息不补算：

- 缺 `width`、`height`：按默认比例占位；
- 缺 `thumb`：图到之前是空框；
- 缺 `service`（或有 `service`，`path` 和 `preview` 都没有）：只显示文件卡，不能打开原文件。

一个图片 part：

```json
{"type": "image", "name": "IMG_0412.jpg", "size": 2310144, "mime": "image/jpeg", "width": 3024, "height": 4032,
 "thumb": "/9j/4AAQSkZJRgABAQ…", "service": "media", "path": "msg/m7/IMG_0412.jpg", "preview": "msg/m7/IMG_0412.preview.jpg"}
```

`post` 发一条语音：

```json
{"text": "[语音] 5″", "parts": [{"type": "audio", "name": "voice.m4a", "mime": "audio/mp4", "duration": 5, "upload": "up_1"}]}
```

一条记录：

```json
{
  "spec": {"title": "项目群", "container": {"id": "wx-1", "title": "我的微信"}},
  "status": {
    "head": "c2",
    "participants": [
      {"id": "u1", "name": "小王", "kind": "person"},
      {"id": "bot", "name": "Coda", "kind": "bot", "self": true}
    ]
  }
}
```

`read` 的一条结果，第二条撤回了第一条：

```json
{
  "messages": [
    {"id": "m1", "cursor": "c1", "sender": "u1", "text": "@Coda 看下构建", "mentions": ["bot"]},
    {"id": "m2", "cursor": "c2", "sender": "u1", "text": "", "about": {"message": "m1", "change": "recall"}}
  ],
  "cursor": "c2",
  "more": false
}
```

## coda/environment@1

插件提供的外部环境，比如别家 Agent 自带的云主机。本版本只读。

spec 是 `{ title, container?, actions }`：`container` 同 `coda/session@1` 的 `{ id, title }`；`actions` 是 `read`、`checkout`、`delete`、`exec` 的子集，界面按它显示能做什么，本版本只认 `read`。以后同一大版本里只加这几个动作对应的操作。

status 是 `{ state: "available"|"unreachable", reason? }`。

两个操作都是立即结果，都是 `safe` 的；路径是 Provider 自己的命名空间，Coda 不解析：

- `list`：输入 `{ path, after? }`，`path` 为 `""` 表示根，`after` 是上一页的 `next`；结果 `{ entries: [{ name, type: "file"|"dir"|"link", size? }], next }`，没有下一页时 `next` 为 `null`。
- `read`：输入 `{ path, offset?, length? }`，`length` 至多 1 MiB（1048576）；结果 `{ path, size, base64, more }`，`size` 是文件总字节数，`base64` 是这一段的内容，`more` 表示后面还有。

```json
{
  "spec": {"title": "云主机", "actions": ["read"]},
  "status": {"state": "available"}
}
```

## coda/card@1

会话向用户或上层 Agent 要的一个输入。复数名是 `cards`。由提出它的会话所在的后端持有；持有方可以按自己的表读穿给出，不另存。运行等它时，`coda/run@1` 的 `status.awaiting` 指向这条记录，回答走那条运行的 `answer`。卡片自己没有操作。

spec：

| 字段 | 含义 |
| --- | --- |
| `kind` | 卡片种类，如 `permission`、`form`、`workflow_task` |
| `title` | 一行标题 |
| `thread` | 提出它的会话，持有方给的 ID |
| `location` | 提出它的会话在哪台机器，给人看；本机的不写 |
| `answers` | 谁能答：`user` 只有用户，`any` 上层 Agent 也能代答 |
| `shown` | 代答的 Agent 要看的内容，对象；`answers` 为 `user` 时不写 |

spec 不带答案的 schema：答案的形状由卡片种类定，持有者在 `answer` 里校验。

status：

| 字段 | 含义 |
| --- | --- |
| `state` | `pending`、`submitting`、`answered`、`expired`、`unknown` |
| `holder` | `pending` 时在谁手上：`user`，或持有它的会话 ID（持有方给的） |
| `reason` | 到这个持有者手上的原因 |
| `note` | 说明 |
| `toldAlong` | `true`：持有它的会话还没被告知，下一条输入时才告诉它 |
| `setAside` | `true`：用户把它搁置了，仍在等，不再要人处理 |

`holder` 是字符串，不是 `{ kind, id }` 引用：镜像发布时会改写 status 里的引用，而持有者可能是别台的会话，本机不一定认得它的持有方。

```json
{
  "spec": {"kind": "workflow_task", "title": "确认发布", "thread": "t1", "answers": "any", "shown": {"text": "要发布 5.2.0 吗？"}},
  "status": {"state": "pending", "holder": "t1", "reason": "assigned", "toldAlong": true}
}
```

## 版本

- 协议名里的大版本是协议自己的版本，和 npm 包版本、插件清单的 v2 独立。
- 同一大版本只加可选字段和新操作；改含义、删字段或删操作就升大版本。新旧版本可并存，插件在 `contributes.protocolImplementations` 里声明实现哪个。
- 复数名同一大版本内不可改。
- 3.0.0 删除了 `executor`、`execution` 两个旧协议与 `@coda-console/protocol/executor`，是不兼容变更；不提供旧格式兼容代码。
