# 协议定义、调用与核心协议 v1

从 3.0.0 起，协议不再只是插件清单里的一组类型：一份协议有名字、记录格式和操作，插件可以定义自己的协议，也可以声明实现别人的协议。调用一条记录的操作只交给这条记录的 provider；被调用方在自己的 `coda/run@1` 记录里报告运行，调用方 watch 它，不再由调用方或被点名的一方写别人的 status。

本包定义：

- 协议定义文档的 JSON Schema 与校验：`schemas/protocol/v1/definition.json`、`@coda-console/protocol/protocol`；
- 统一调用信封：`schemas/protocol/v1/request.json`、`response.json`；
- 五个核心协议：`coda/run@1`、`coda/executor@1`、`coda/agent@1`、`coda/session@1`、`coda/environment@1`；
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
| `operations` | 操作名 → `{ description?, input, result, safe? }` 或 `{ description?, input, run: true }`，必填；不定义操作写 `{}` |

`spec`、`status`、`input`、`result` 都是 JSON Schema draft 2020-12，只引用自己文档里的 `#/$defs/...`，不引用别的文件。`input` 必有。操作的输出二选一：

- `result`：立即返回结果的 schema；
- `run: true`：返回一个运行引用，运行记录由被调用方持有。

`safe: true` 只能和 `result` 一起写，不能和 `run` 一起写，表示只读、没有副作用、立即给结果的操作；调用方和被调用方都不按 `requestId` 留它的请求和回答（见「调用信封」）。

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

`requestId` 由调用方给，重发同一个请求只做一次。`safe` 的操作例外：调用双方都不按 `requestId` 留请求和回答，重发就再读一次。读回来的是对方的数据，比如群消息、环境里的文件内容，留在调用双方的库里就成了镜像。立即结果用 `result`；慢的操作用 `run` 指向被调用方自己的 `coda/run@1` 记录，调用方 watch 这条记录取结果，被调用方不推送。取消也是一次调用（`coda/run@1` 的 `cancel` 操作），不是写别人的记录。

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
| `awaiting` | 等输入时那张卡片的引用；`input-required` 必填，其他状态不写 |

`failed` 的 `result` 约定为 `{ code, message }`。`code: "unknown"` 表示结局不明（例如执行连接中断），调用方据此显示「结果未知」，不当作失败。

终态是最后的写入：`runStatusProblem(previous, next)` 在 `previous` 已是终态时返回说明，同一状态再写也不行。进行中的状态可以互相转换（`working` 与 `input-required`），也可以进入任一终态。

操作 `cancel` 的输入是空对象，立即返回空结果；是否真的停下看 status。

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

操作 `spawn`（`run: true`）：在这台机器上用这个 Agent 开一个子会话，返回运行引用。输入是 `{ projectId, threadId, title, text, settings?, checkout?, parentTitle, parentUnattended }`：子会话所在的项目与工作树（`checkout`）、Agent 的设置（`settings`，如模型与推理强度）、标题与第一条任务（`text`）；`threadId` 是调用方给的子会话 ID，重试找到的是同一个；`parentTitle` 是发起方在这里显示的名字，`parentUnattended` 说发起方是否无人值守。子会话为谁工作由调用信封的 `parent` 说，不写在输入里。

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

插件提供的外部会话，比如一个微信群：参与者、消息和发消息。

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

观察方 watch 这条记录，`head` 变了就用 `read` 读游标之后的消息。两个操作都是立即结果，不开运行；`read` 是 `safe` 的：

- `read`：输入 `{ after?, before?, limit? }`，`after`、`before` 是游标，`limit` 为 1 到 100；结果 `{ messages, cursor, more }`，没有消息时 `cursor` 为 `null`。`messages` 总按先后排，旧的在前：
  - 都不带游标：最新的 `limit` 条，`more` 表示更早还有没有；客户端打开会话时先读这一页；
  - 只带 `after`：这个游标之后的，`more` 表示之后还有没有；
  - 只带 `before`：这个游标之前最新的 `limit` 条，`more` 表示更早还有没有；往前翻页就拿这一页第一条的 `cursor` 作下一次的 `before`；
  - `after` 与 `before` 不能同时带。
- `post`：输入 `{ text, parts?, replyTo?, mentions? }`；结果 `{ message: { id, cursor } }`。发送者固定是 `self`；Provider 按调用的 `requestId` 只发一次，发送失败就报错。

消息是 `{ id, cursor, sender, senderName?, text, parts?, replyTo?, mentions?, about?, createdAt? }`：

- `sender` 与 `mentions` 写参与者 ID，`replyTo` 写消息 ID；
- `senderName` 是发送者当时的显示名，可选：大群不必把每个发送者都写进 `status.participants`；
- 回复一条消息就算 @ 了它的发送者，Provider 把被回复消息的发送者也写进 `mentions`：只有 Provider 知道被回复的那条是谁发的，观察方不用记住 Bot 发过哪些消息；
- `text` 是纯文本兜底，看不懂 `parts` 的一方只看它；
- 撤回、编辑、表情回应都是一条新消息，`about: { message, change: "edit"|"recall"|"reaction", value? }` 指向旧消息；
- `createdAt` 只供显示，顺序看 `cursor`。

`parts` 的每一项是下面之一：

- `{ type: "text", text }`；
- `{ type: "image"|"video"|"file", name, size?, mime?, width?, height?, duration?, thumb?, service?, path? }`：媒体，大文件只给引用，字段见下；
- `{ type: "thinking"|"tool", text }`。

媒体 part 在 `read` 的消息和 `post` 的输入里是同一种形状，`type`、`name` 以外都可选：

| 字段 | 含义 |
| --- | --- |
| `name`、`size`、`mime` | 文件名、字节数、MIME 类型 |
| `width`、`height` | 像素，整数，至少 1，已按拍摄方向转正；图片和视频用 |
| `duration` | 时长，秒，不为负；视频用 |
| `thumb` | 内嵌 JPEG 的 base64（不带 `data:` 前缀），长边不超过 64 像素，至多 8192 个字符；视频用封面帧 |
| `service` | provider 插件登记的本机流式服务 ID |
| `path` | 服务内路径，1 到 2048 个字符；有 `path` 就必须有 `service` |

尺寸和缩略图让框在原图到达前就是最终大小：先显示放大、模糊的 `thumb`，原图到了在原地换上。
原文件：观察方读记录持有方的 `/v1/plugins/<provider 插件>/services/<service>/<path>`（别的机器经空间到达持有方）；`path` 原样接在后面，Provider 写它时就按 URL 路径编码好，不以 `/` 开头。
字节、Range 和流中断语义沿用 Coda 的本机流式服务。

缺字段时这样降级，旧消息不补算：

- 缺 `width`、`height`：按默认比例占位；
- 缺 `thumb`：空框；
- 缺 `service`（或有 `service` 没有 `path`）：只显示文件卡，不能打开原文件。

一个图片 part：

```json
{"type": "image", "name": "IMG_0412.jpg", "size": 2310144, "mime": "image/jpeg", "width": 3024, "height": 4032,
 "thumb": "/9j/4AAQSkZJRgABAQ…", "service": "media", "path": "msg/m7/IMG_0412.jpg"}
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

## 版本

- 协议名里的大版本是协议自己的版本，和 npm 包版本、插件清单的 v2 独立。
- 同一大版本只加可选字段和新操作；改含义、删字段或删操作就升大版本。新旧版本可并存，插件在 `contributes.protocolImplementations` 里声明实现哪个。
- 复数名同一大版本内不可改。
- 3.0.0 删除了 `executor`、`execution` 两个旧协议与 `@coda-console/protocol/executor`，是不兼容变更；不提供旧格式兼容代码。
