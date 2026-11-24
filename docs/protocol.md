# 协议定义、调用与核心协议 v1

从 3.0.0 起，协议不再只是插件清单里的一组类型：一份协议有名字、记录格式和操作，插件可以定义自己的协议，也可以声明实现别人的协议。调用一条记录的操作只交给这条记录的 provider；被调用方在自己的 `coda/run@1` 记录里报告运行，调用方 watch 它，不再由调用方或被点名的一方写别人的 status。

本包定义：

- 协议定义文档的 JSON Schema 与校验：`schemas/protocol/v1/definition.json`、`@coda-console/protocol/protocol`；
- 统一调用信封：`schemas/protocol/v1/request.json`、`response.json`；
- 六个核心协议：`coda/run@1`、`coda/agent@1`、`coda/session@1`、`coda/environment@1`、`coda/card@1`、`coda/resource@1`；
- 插件清单里的 `contributes.protocols`、`contributes.protocolImplementations` 与 `contributes.records`。

`executor` 与 `execution` 两个旧对象协议和 `@coda-console/protocol/executor` 在 3.0.0 删除。

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
| `spec` | 记录的 spec 的 JSON Schema；没写 `events` 时必填，与 `status` 一起写 |
| `status` | 记录的 status 的 JSON Schema；没写 `events` 时必填，与 `spec` 一起写 |
| `operations` | 操作名 → `{ description?, input, result, safe?, idempotent?, timeout? }` 或 `{ description?, input, run: true, timeout? }`；没写 `events` 时必填，不定义操作写 `{}` |
| `streams` | 流名 → `{ description?, input, shape?, frames?, subprotocol? }`，可选（见「记录流」） |
| `events` | 事件名 → `{ description?, payload, starts?, ends? }`，可选（见「事件」） |
| `resource` | 展示声明 `{ columns, symbol? }`，可选（见「资源展示」） |
| `permissions` | 权限组名 → `{ title, trial?, operations?, streams?, events?, read?, sessions? }`，可选（见「权限组」） |

`spec`、`status`、`input`、`result` 都是 JSON Schema draft 2020-12，只引用自己文档里的 `#/$defs/...`，不引用别的文件。`input` 必有。操作的输出二选一：

- `result`：立即返回结果的 schema；
- `run: true`：返回一个运行引用，运行记录由被调用方持有。

`safe: true` 只能和 `result` 一起写，不能和 `run` 一起写，表示只读、没有副作用、立即给结果的操作；调用方和被调用方都不按 `requestId` 留它的请求和回答（见「调用信封」）。

`idempotent: true` 也只能和 `result` 一起写，不能和 `run` 一起写，表示可以改状态、但重发做的是同一件事的立即结果操作，比如把草稿设成某一段：调用双方和 `safe` 一样，都不按 `requestId` 留请求和回答。两者是 HTTP 的 safe 与 idempotent 之分：`safe` 只读，`idempotent` 可以改状态。`safe` 已含 `idempotent`，两个不同时写。

`timeout` 可选，是这个操作的默认期限：毫秒数，正整数。调用方没给截止时刻（请求信封的 `deadline`，见「调用信封」）时，持有方从收到请求起按它算；不写就用宿主的默认期限，具体数由宿主定。

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

记录引用 `{ kind, id }` 的 `kind` 是协议名，如 `coda/run@1`、`coda/session@1`、`git/source@1`；`id` 是记录的不透明 ID。Coda 自己还没定义成协议的东西（会话、流程运行等）暂用它现有的资源种类名，如 `threads`、`workflow-runs`，等后续定义成协议再改用协议名。

一次调用是：

```json
{
  "record": {"kind": "coda/session@1", "id": "chat-1"},
  "operation": "post",
  "input": {"text": "构建通过了"},
  "requestId": "request-1",
  "parent": {"kind": "coda/run@1", "id": "caller-run"},
  "awaited": true
}
```

`parent` 是发起这次调用的一方（调用方的运行、会话或其他记录），`awaited` 表示调用方是否在等它。被调用方建运行时把这两项照抄进 `coda/run@1` 的 spec。

可选的 `deadline` 是调用方给的截止时刻：绝对时刻的毫秒时间戳，即自 1970 年起的毫秒数，正整数，与调用内核（`@coda-console/kernel`）定时器的 `due` 是同一种表示。持有方到点就触发处理函数的取消。不带 `deadline` 时，持有方从收到请求起按操作定义里的 `timeout`（毫秒数）算；操作没写 `timeout` 就用宿主的默认期限。

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

### 记录流

流是协议记录上的第三种入口，和查询、操作并列：按记录 `{ kind, id }` 寻址，内容是一条流（而不是一个 JSON 结果）。一条流就是一次 HTTP 交换，同一时刻只有一个方向在流；要两个方向同时流，就开一条读加一条写。定义用顶层 `streams` 声明，键是流名（写法同操作名：小写字母开头，只用小写字母、数字和「-」，至多 64 个字符，至多 50 条），值是：

| 字段 | 含义 |
| --- | --- |
| `description` | 可选，一句话说明 |
| `input` | 必填，参数的 JSON Schema（draft 2020-12，和操作的 `input` 同一写法，`definitionProblem` 查它能编译） |
| `shape` | 可选，形状：`read`、`write`、`http` 之一，不写就是 `read`，见下 |
| `frames` | 可选，只能写 `true`，表示内容是帧流；不写就是字节流。`shape` 为 `http` 时不能写 |
| `subprotocol` | 带版本的子协议名，如 `git-smart-http/2`：小写字母开头，只用小写字母、数字和「-」，后面是「/」加数字。`shape` 为 `http` 时必须写，其余形状不能写 |

不许有别的键。三种形状：

| `shape` | 方法 | 请求体 | 应答体 |
| --- | --- | --- | --- |
| `read`（不写就是它） | GET | 无 | 流，字节或帧 |
| `write` | POST | 流，字节或帧 | 结束时给一个短应答 |
| `http` | GET、POST | 有限 | 有限 |

`http` 是原样的 HTTP，给自带 HTTP 语义的子协议用（如 git smart HTTP）：地址后面可以带路径后缀，里面跑的是什么由 `subprotocol` 说。

参数都来自查询串，取值都是字符串，所以 `input` 里的属性按字符串写约束。流名可以和操作名相同，两者各管各的。定义里不写 `streams` 就是没有流。本包只管声明的形状；怎样寻址、怎样传字节是宿主的事。

```json
"streams": {
  "log": {
    "description": "一个步骤的日志，可从字节偏移取起",
    "input": {
      "type": "object",
      "properties": {"job": {"type": "string"}, "after": {"type": "string", "pattern": "^[0-9]+$"}},
      "required": ["job"],
      "additionalProperties": false
    }
  },
  "changes": {
    "description": "状态变化，一帧是一次变化",
    "frames": true,
    "input": {"type": "object", "additionalProperties": false}
  },
  "git": {
    "description": "仓库的 git smart HTTP",
    "shape": "http",
    "subprotocol": "git-smart-http/2",
    "input": {"type": "object", "additionalProperties": false}
  }
}
```

**帧流**（`frames: true`）是 `application/x-ndjson`，UTF-8，一行一个 JSON 对象，每行以 `\n` 收尾：

- **空行是心跳**（只含空格、制表符、回车的行也算），读的一方跳过。发送方一段时间没写过东西就写一个空行；
- 一行（不含 `\n`）默认至多 1 MiB，`readFrames` 的 `maxBytes` 可以改，收发双方要约定一致；
- 流结束时最后一行没有 `\n` 又不是空的，就是被截断，不算一帧；
- 一帧里有什么由这条流的 `description` 说，不写进定义的 schema，宿主不解释。

没写 `frames` 的是字节流，内容不解释，没有帧也没有心跳。读写帧流用 `@coda-console/protocol/frames`，只用 Web 标准的流，Node 和浏览器都能跑：

```js
import { readFrames, writeFrames, FrameError } from '@coda-console/protocol/frames';

// ReadableStream<Uint8Array> → 异步迭代器，逐个给出对象；提前 break 就取消底下的流；读完、出错、提前结束都释放它的锁。
for await (const frame of readFrames(request.body, { maxBytes: 1024 * 1024 })) handle(frame);
// （异步或同步）可迭代的对象 → ReadableStream<Uint8Array>；15 秒没写过东西就写一个空行。
const body = writeFrames(frames, { heartbeatMs: 15000 });
```

读到坏的帧抛 `FrameError`，消息说是第几帧（心跳不算），`code` 是 `truncated`（被截断）、`too_large`（一行超过 `maxBytes`，不等收完就抛）或 `invalid`（不是合法 JSON，或不是对象）。`writeFrames` 不给 `heartbeatMs` 就不发心跳；消费方没在读时不往里堆心跳；遇到不是普通对象的值，或写出来（经 `toJSON`）不是 JSON 对象的，流以 `invalid` 出错，那个值不写出去。

### 事件

定义用顶层 `events` 声明协议的事件，键是事件名，值是：

| 字段 | 含义 |
| --- | --- |
| `description` | 可选，一句话说明 |
| `payload` | 必填，载荷的 JSON Schema（draft 2020-12，`definitionProblem` 查它能编译）；顶层不能定义 `coda`，那是留给宿主的 |
| `starts` | 可选，布尔，默认 `true`；`false` 表示这个事件不开新流程，只交给已在跟这个主体的运行 |
| `ends` | 可选，布尔；`true` 表示这个事件结束它的主体（如 PR 关闭） |

事件名是点分的全名：「域.名」，小写字母、数字和「_」，以字母开头，至多 100 个字符，至少两段，如 `pull_request.closed`；至多 50 条。`coda/` 以外的协议不能用 `workflow`、`session`、`user` 做域，那是 Coda 自己的。事件的版本就是所在协议的大版本，没有另外的版本号。事件名在本机是否唯一、谁能发、怎样投递是宿主的事，本包只管声明的形状。

只有事件的协议：写了 `events` 的定义可以不写 `spec`、`status`、`operations`，那样的协议没有记录；`spec` 与 `status` 要么都写，要么都不写。判断一份定义有没有记录用 `protocolHasRecords(definition)`（有 `spec` 就有记录），宿主据此不把只有事件的协议列成记录种类。操作、流、读记录都按记录寻址，所以没有记录的协议不能有非空的 `operations`、非空的 `streams`，也不能有 `read: true` 的组（`definitionProblem` 查）；要这些就必须同时写 `spec` 和 `status`。没写 `events` 的定义，`spec`、`status`、`operations` 仍必填。

```json
{
  "name": "my-plugin/pulls@1",
  "events": {
    "pull_request.opened": {"payload": {"type": "object", "properties": {"number": {"type": "integer"}}, "required": ["number"]}},
    "pull_request.closed": {"payload": {"type": "object"}, "starts": false, "ends": true}
  },
  "permissions": {
    "notify": {"title": "收到 PR 的打开与关闭通知", "trial": true, "events": ["pull_request.opened", "pull_request.closed"]}
  }
}
```

### 资源展示

定义可以写 `resource`，声明这个种类在资源列表里怎么展示：

```json
"resource": {"columns": ["name", "region", "port"], "symbol": "server.rack"}
```

| 字段 | 含义 |
| --- | --- |
| `columns` | 必填，非空、不重复、至多 8 项的字符串数组，每项是 `spec` 的顶层字段名（1–64 个字符） |
| `symbol` | 可选，客户端画的 SF Symbol 名，1–64 个字符 |

不许有别的键。写了 `resource` 的种类成为可列出、可引用的资源：列表里每条按 `columns` 的顺序显示，第一列是名字；所在机器那一列由宿主自己加，不用写；列名取该字段 schema 的 `title`，没有就用字段名；只展示这些列与 `spec` 里带 `description` 的字段。不写就和没有这个声明一样。

`definitionProblem` 还查：每一列都必须是 `spec.properties` 里声明的字段，且该字段是标量：它的 schema 的 `type` 是 `string`、`number`、`integer` 或 `boolean` 之一（`type` 是数组时，去掉 `"null"` 后只剩一种标量也算；有 `enum` 而无 `type` 不算）。没写 `spec` 的定义（只有 `events` 的协议）不能写 `resource`。报错写明 `<位置>.resource.columns[i]` 与原因。

### 权限组

一切对插件开放的能力都以协议提供，权限挂在协议上：定义用 `permissions` 把自己的操作、流、事件与记录的读取分成组，插件在清单的 `uses`（必需）或 `optionalUses`（可选）里声明用到哪些组，没声明的调用被宿主拒绝。组名的写法同操作名（小写字母开头，只用小写字母、数字和「-」，至多 64 个字符）。每组：

| 字段 | 含义 |
| --- | --- |
| `title` | 必填，给用户看的一句话，说这组让插件能做什么，如「读取会话的标题与状态」 |
| `trial` | 可选，布尔，这组是否试行；只影响展示，不影响能否调用 |
| `operations` | 可选，不重复的操作名数组，归这组管的操作 |
| `streams` | 可选，不重复的流名数组，归这组管的流 |
| `events` | 可选，至少一项、不重复的事件名数组，归这组管的事件；插件在 `uses` 或 `optionalUses` 里写了这组，就是订了组里全部事件 |
| `read` | 可选，布尔，管不管读这个协议的记录（get、list、watch）。写记录只许实现方，不分给插件 |
| `sessions` | 可选，布尔，为 true 表示这组里的操作与流开放给会话（会话经工具调用），不只是开放给插件 |

不许有别的键。写了 `permissions` 的定义还要满足（`definitionProblem` 查）：每个操作、每条流、每个事件最多属于一组；组里列的操作都在 `operations` 里，列的流都在 `streams` 里，列的事件都在 `events` 里；每组至少管一样东西（有操作、有流、有事件，或 `read` 为 true）；有 `events` 的组只放事件：`events` 至少一项，且不能再出现 `operations`、`streams`、`read`、`sessions` 这几个键，写成 `[]` 或 `false` 也不行；写了 `sessions` 的组（不论 true 还是 false）必须至少有一个操作或一条流，只有 `read` 不够。**不在任何组里的操作、流和事件不对插件开放**，只有 Coda 自己和它的客户端调；不写 `permissions` 的定义照旧合法，那时整个协议都不对插件开放。

```json
"permissions": {
  "read": {"title": "读取任务的标题与状态", "read": true, "operations": ["peek"]},
  "start": {"title": "开始一个任务", "operations": ["start"]}
}
```

`coda/run@1`、`coda/agent@1`、`coda/session@1`、`coda/environment@1`、`coda/resource@1` 的分组如下，都标 `trial`（还不在稳定面里）。`coda/session@1` 的流 `draft`（外部会话输入框的击键流）和将退役的 `draft` 操作都不分组，不对插件开放：

| 协议 | 组 | 说明 | 管什么 |
| --- | --- | --- | --- |
| `coda/run@1` | `read` | 查看运行的状态与结果 | 读记录 |
| | `cancel` | 取消正在进行的运行 | `cancel` |
| `coda/agent@1` | `read` | 查看机器上装着哪些 Agent，以及它们的模型与模式 | 读记录 |
| | `spawn` | 用 Agent 开一个新会话并交给它任务 | `spawn` |
| `coda/session@1` | `read` | 读取外部会话的标题、参与者与消息 | 读记录、`read` |
| | `post` | 以你的身份往外部会话里发消息 | `post` |
| `coda/environment@1` | `read` | 浏览并读取外部环境里的目录与文件 | 读记录、`list`、`read` |
| `coda/resource@1` | `read` | 查看资源类型与它们的读数 | 读记录 |
| | `act` | 做资源上的动作、登录和安装 | `act`、`sign-in`、`install` |

插件申请权限写在清单根的 `uses`（必需）或 `optionalUses`（可选）里（见「插件清单」）。可选权限缺席时不阻止插件运行，可用性判定与鉴权由 Coda 宿主负责。

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

`contributes.protocols` 是插件拥有的定义，每份都按定义文档 schema 校验；定义里的命名空间必须等于插件 ID。`contributes.protocolImplementations` 是插件实现的协议列表，可以包含别的命名空间下的协议（包括 `coda/...`），最多 100 项。每项有两种写法：

```json
"protocolImplementations": [
  "my-plugin/task@1",
  {"kind": "coda/run@1", "commands": {"cancel": "bin/cancel.sh"}}
]
```

- 协议名（文本）：这个协议的全部操作都由模块实现。
- `{ "kind": "<协议名>", "commands": { "<操作名>": "<文件>" } }`：`commands` 至少一项，键是操作名（格式同定义里 `operations` 的键，这个操作在不在协议定义里由 Coda 装载时查），值是插件目录里的文件（相对路径，不离开插件目录）。`commands` 里列出的操作由这个文件实现，**没列在 `commands` 里的操作由模块实现**。对象里不能有 `kind`、`commands` 之外的键。命令怎么写、怎么跑由 Coda 的文档讲，这里不重述。

同一个协议在数组里只能出现一次，写成文本还是对象都算。

`contributes.optionalProtocolImplementations` 是插件可选实现的协议列表：协议名的数组，至多 100 项、不重复，只收文本，不收 `{ kind, commands }`。这些协议本机没有时，插件照常运行，只是这一项不生效；同一个协议不能既写在这里又写在 `protocolImplementations` 里（文本项、对象项的 `kind` 都算）。

`contributes.reservedAccordKinds` 声明哪几种 Accord 签名记录（AIP-01）的种类只归本插件：「命名空间/名字」的数组，至多 32 项、不重复，每项须匹配 `^[a-z0-9-]{1,64}/[a-z0-9-]{1,64}$`（比 Accord 的种类规则少了可选的命名空间：必须带），命名空间须等于插件 ID（没写 `id` 时用 `name`）。只有本插件能直接发布、撤回、读这些种类。

这两个键协议包只校验形状与上面两条跨键规则；协议在不在、这一项生不生效、谁被拒绝由 Coda 宿主判定。

`contributes.records` 声明哪些种类的记录由命令给出，每种一项，至多 20 项：

```json
"records": [
  {"kind": "my-plugin/task@1", "command": "bin/tasks.sh", "every": "PT5M"}
]
```

- `kind`：协议名；同一种类只能出现一次。须是这个插件 `protocolImplementations` 里的种类，由 Coda 装载时查。
- `command`：插件目录里的文件（相对路径，不离开插件目录），写法同 `commands`。
- `every`：可选，定时重跑的间隔，ISO 8601 风格：周 `W`、天 `D`、时 `H`、分 `M`、秒 `S`（如 `PT5M`、`PT90S`、`P1W1D`），只有秒能带小数点，不收年、月；不短于 `PT1M`；不写就不定时。下限 schema 表达不了，由 Coda 判。
- 不许别的键。命令怎么跑、打印什么由 Coda 的文档讲，这里不重述。

插件用到别的协议的权限，必需的写在清单根的 `uses`，可选的写在 `optionalUses`（见下），都不放进 `contributes`（`contributes` 里只有 Coda 认得的键）。键是带大版本的协议名，值是权限组名的数组，至少一项、不重复：

```json
{
  "id": "my-plugin",
  "uses": {"coda/session@1": ["read"], "coda/environment@1": ["read"]}
}
```

协议名与组名只查写法；协议和组在不在目录里，由 Coda 校验。实现一个协议不用在 `uses` 里申请它。

可选用到的协议写在 `optionalUses`，形状与 `uses` 完全相同。对应的协议、权限组或提供方缺席、未启用、停用时不阻止插件运行；可用不可用的判定与鉴权由 Coda 宿主负责，协议包只校验形状。

清单根上的 `engines.coda` 写插件要的最低 Coda API Level，正整数（`0`、负数、小数、字符串都被拒）；不写视为不限。`engines` 里的其余键（如 `node`）不管：

```json
{"id": "my-plugin", "engines": {"coda": 3}}
```

这里只查形状；Coda 当前的 API Level 与兼容判定由 Coda 实现。

`manifestProblem` 校验清单的外壳与通用键（这两个键在其中）；别的键由 Coda 的贡献点登记表声明，按登记方的 schema 校验，本包不管它们的形状。命名空间约束需要插件 ID，单独用：

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

`cancel` 交给运行的持有者处理：被调用方按 `spec.record.kind` 找到持有这条运行的一方。

```json
{
  "spec": {
    "record": {"kind": "coda/session@1", "id": "chat-1"},
    "operation": "post",
    "input": {"text": "构建通过了"},
    "requestId": "request-1",
    "parent": {"kind": "coda/run@1", "id": "parent-run"},
    "awaited": true
  },
  "status": {"state": "working", "progress": "准备中"}
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
| `participants` | `[{ id, name, kind: "person"\|"agent"\|"bot", self?, avatar? }]`；`self: true` 是这个 Provider 登录的账号，即 Coda 的 Bot；`avatar` 见下 |
| `state` | 可选，`active` 或 `unreachable` |
| `reason` | 可选，状态说明 |
| `activity` | 可选，`{ participant, text }`：参与者正在做什么 |
| `accepts` | 可选，`post` 除文字以外还收哪些媒体 part，见下 |
| `notify` | 可选，布尔：`true` 表示这条记录来了新消息要提醒用户，见下 |

`activity.participant` 须是 `status.participants` 中某一项的 `id`；Provider 负责保证这个对应关系。`text` 是 1 到 200 个字符的单行文字（不含换行符），如「正在搜索代码」。
像聊天软件的「正在输入」：Provider 不提供就不写，对方停下时删掉整个 `activity`。它不是消息，不进 `read`，不推进 `head`。

`accepts` 是一个对象，键是媒体 part 的 `type`，值是这一类型的限制，没有限制就写 `{}`。本版本只有 `audio` 一个键，以后要收别的类型再加键：

| 键 | 值 |
| --- | --- |
| `audio` | `{ maxDuration? }`：收 `upload` 引用的语音；`maxDuration` 是一条语音最长多少秒，大于 0 |

参与者的 `avatar` 是一个指针（见下面「指针」）；图片长边一般取 100 到 200 像素就够。
不写、或读不到（404、`owner` 连不上）时，观察方用名字代替（如名字的第一个字），不当成错误。头像换了，Provider 就换一个 `path`，观察方按 `owner` 加 `path` 缓存。
旧写法 `{ service, path }` **将退役，改写指针**，现在照收：头像图片在 provider 插件登记的本机流式服务里的路径，`service` 1 到 200 个字符，`path` 1 到 2048 个字符，两个都要有，不能和指针的字段混写；在记录持有方的 `/v1/plugins/<provider 插件>/services/<service>/<path>`。

不写 `accepts` 就是只收文字。客户端据此决定显示不显示录音入口，录音时到 `maxDuration` 自动停止。放在 status 而不在 spec，是因为 Provider 的能力可能随状态变化，例如手机上的麦克风权限被收回。

```json
{"participants": [], "accepts": {"audio": {"maxDuration": 60}}}
```

`notify: true` 表示这条记录来了新消息要提醒用户：观察方（Coda）在 `head` 越过用户的已读位置时推到手机、在电脑上弹横幅，读到 `head` 后撤掉。不写或写 `false` 就不提醒，这是缺省，所以不认识这个字段的旧 Provider 不会开始提醒。
写不写由 Provider 按记录决定，比如只给用户在设置里选中的群写 `true`；设置改了就改 status，所以它放在 status 而不在 spec。提醒只说「有新消息」，不带消息正文。

观察方 watch 这条记录，`head` 变了就用 `read` 读游标之后的消息。`read` 与 `draft` 是立即结果，`read` 是 `safe` 的，`draft` 是 `idempotent` 的；`post` 开运行；击键走流 `draft`，见下：

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
- `draft`（`idempotent`，**将退役，改用流 `draft`**）：设定 `self` 在这个会话里还没发出去的文字，结果 `{}`。输入 `{ text, version, steps? }`：
  - `text` 是当前草稿的全文，至多 65536 个字符；空串表示清空或放弃；
  - `version` 是调用方给的非负整数版本号，比大小：Provider 收到不大于已见最大版本的直接丢掉，多台设备都在写时后写的为准；建议用毫秒时间；
  - `steps` 可选，至多 1000 项，是从上一版到这一版之间按先后排的中间状态 `{ text, delayMs }`：每一步的全文，以及距上一步的间隔（毫秒，0 到 600000）；Provider 可以照这个节奏回放，最后一步等于 `text`；
  - Provider 可以把草稿同步到对方平台的输入框，用户发出时那边基本已经打完；用不上草稿的 Provider 直接答 `{}`。

流 `draft`（`shape: "write"`、`frames: true`，没有查询参数）是外部会话输入框的击键流，不在任何权限组里，不对插件开放：

- 一帧是 `{ text, version, steps? }`，含义同上面 `draft` 操作的输入；
- 一帧序列化后（不含换行）至多 1 MiB，即 `readFrames` 的默认上限；放不下时发送方去掉 `steps`，只发 `text` 和 `version`；接收方对超过的一帧报错、断开这条流；
- 客户端打开外部会话的页面时开流，页面离开就结束请求体，Provider 给一个短应答；
- 没有新帧时按空行心跳：15 秒没写过东西就写一个空行，从开流算起，每写一行重新计。空行不更新草稿，也不算版本。

消息是 `{ id, cursor, sender, senderName?, text, parts?, replyTo?, mentions?, about?, createdAt? }`：

- `sender` 与 `mentions` 写参与者 ID，`replyTo` 写消息 ID；
- `senderName` 是发送者当时的显示名，可选：大群不必把每个发送者都写进 `status.participants`；
- 回复一条消息就算 @ 了它的发送者，Provider 把被回复消息的发送者也写进 `mentions`：只有 Provider 知道被回复的那条是谁发的，观察方不用记住 Bot 发过哪些消息；
- `text` 是纯文本兜底，看不懂 `parts` 的一方只看它；
- 撤回、编辑、表情回应都是一条新消息，`about: { message, change: "edit"|"recall"|"reaction", value? }` 指向旧消息；
- `createdAt` 只供显示，顺序看 `cursor`。

`parts` 的每一项是下面之一：

- `{ type: "text", text }`；
- `{ type: "image"|"video"|"file"|"audio", name, size?, mime?, width?, height?, duration?, thumb?, blob?, preview?, service?, path?, upload? }`：媒体，大文件只给引用，字段见下；
- `{ type: "thinking"|"tool", text }`。

媒体 part 的 `type`、`name` 以外都可选。`read` 的消息用指针（`blob`、`preview`）指向文件；`post` 的输入用 `upload`，不收指针：

| 字段 | 含义 |
| --- | --- |
| `name`、`size`、`mime` | 文件名、字节数、MIME 类型 |
| `width`、`height` | 像素，整数，至少 1，已按拍摄方向转正；图片和视频用 |
| `duration` | 时长，秒，不为负；视频和语音用 |
| `thumb` | 内嵌 JPEG 的 base64（不带 `data:` 前缀），至多 8192 个字符；视频用封面帧 |
| `blob` | 只在 `read` 的消息里：原文件的指针 |
| `preview` | 预览图。`read` 的消息里写指针；写字符串是旧写法，**将退役，改写指针**：预览图在同一个 `service` 里的服务内路径，1 到 2048 个字符 |
| `service` | **将退役，改用 `blob` 和指针的 `preview`**。旧写法：provider 插件登记的本机流式服务 ID |
| `path` | **将退役，改用 `blob`**。旧写法：原文件的服务内路径，1 到 2048 个字符 |
| `upload` | 只在 `post` 的输入里：持有这条记录的机器上 Coda 上传的 ID（那台机器 `POST /v1/uploads` 返回、`GET /v1/uploads/<id>` 能读回的），1 到 200 个字符 |

新旧写法不混写：`blob` 与 `service`、`path` 互斥，指针的 `preview` 与 `service` 互斥。旧写法照收：有 `path` 或字符串的 `preview` 就必须有 `service`。什么都不指的 part（如只有 `thumb`）也有效。
`upload` 与 `service`、`path`、`preview` 互斥。`post` 的输入里 `service`、`path`、字符串的 `preview` 的形状没变。

**指针**说内容在哪台后端的哪个地址，内容本身不在消息和记录里。形状是 `{ owner, path, name?, size?, mime?, sha256? }`，`owner`、`path` 必写，不许别的键：

| 字段 | 含义 |
| --- | --- |
| `owner` | 后端的机器 ID，小写 UUID |
| `path` | 那台上的地址，见下 |
| `name`、`size`、`mime` | 文件名、字节数、MIME 类型，约束同媒体 part 的同名字段 |
| `sha256` | 内容的 SHA-256，64 位小写十六进制；是写的一方的声明 |

`path` 是 URL 路径的写法，已按段百分号编码，不带 `/v1/`、不带开头的 `/`、不带 `?` 和 `#`，至多 2048 个字符。只收三类：

| 写法 | 是什么 |
| --- | --- |
| `uploads/<上传 ID>`、`uploads/<上传 ID>/preview` | 那台上的一个上传，和它的预览图；上传 ID 是小写 UUID |
| `plugins/<插件 ID>/services/<服务 ID>/<路径>` | 那台上一个插件登记的本机流式服务里的内容；两个 ID 都是小写字母、数字和「-」，以字母开头，至多 40 个字符，路径至少一段 |
| `content/<sha256>` | 内容寻址：按内容的 SHA-256 取，`<sha256>` 是 64 位小写十六进制，后面没有别的段；供后端内容寻址缓存、头像与跨尾网小图等复用同一套指针 |

每一段非空，只用 RFC 3986 的路径字符（字母、数字、`-._~!$&'()*+,;=:@`）和百分号编码，百分号后面必须是两位十六进制；不是 `.`、`..`，也不是它们的百分号写法（URL 解析器会把 `%2e%2e` 当成 `..`）；不许有编码过的斜杠和反斜杠（`%2f`、`%5c`，大小写都算）。

**谁来取**：读的一方拿着指针找 Coda 取，不自己拼插件服务的地址；`owner` 不是它连着的那台时由 Coda 转。schema 只查写法，不核对 `owner`、插件和写的一方是不是同一个，取的时候由 Coda 判。

三类路径列在 `@coda-console/protocol/blob` 的表里，schema 的 `pattern` 和它判得一样：

```js
import { parseBlobPath } from '@coda-console/protocol/blob';

parseBlobPath('uploads/1c79fe8d-d534-4cb8-a53a-64c03a117027/preview');
// { kind: 'upload', upload: '1c79fe8d-d534-4cb8-a53a-64c03a117027', preview: true }
parseBlobPath('plugins/wechat/services/media/msg/m7/IMG_0412.jpg');
// { kind: 'service', plugin: 'wechat', service: 'media', path: 'msg/m7/IMG_0412.jpg' }，path 是原样的，没有解码
parseBlobPath('content/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
// { kind: 'content', sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }
parseBlobPath('plugins/wechat/services/media/../secret'); // null
```

`audio` 是一段语音消息，即对方平台的「语音条」，不是任意音频文件：

- 用 `name`、`size`、`mime`、`duration` 和 `blob`（`post` 里是 `upload`）；`width`、`height`、`thumb`、`preview` 对它没有意义，不用；
- `blob` 给出的文件应当是常见播放器能直接播放的格式（如 AAC/M4A、MP3、WAV），`mime` 写实际给出的格式；对方平台的原始编码不能直接播时，由 Provider 转换；
- 观察方看不懂 `audio` 时照常退回 `text`：Provider 给语音消息写一个可读的 `text` 兜底，例如「[语音] 5″」，具体写法由 Provider 定。

发语音时，调用方先把录好的文件传到记录的持有方（`POST /v1/uploads`），再在 `post` 里用 `upload` 引用；持有方的 Coda 负责把上传交给 Provider 读取，Provider 不经网络取。本版本 `upload` 只要求 Provider 对 `audio` 支持，其他类型以后再说。

一个媒体分三档，从小到大：

- **`thumb`**：内嵌在消息里，框一出现就能画。约束只是至多 8192 个字符：自己生成时长边取 64 像素左右；Provider 手上已有的小缩略图，只要在上限以内，可以原样放进来。
- **`preview`**：指针 `owner` 那台上就有的较小版本，那台不一定是记录的持有方；旧的字符串写法是持有方本地就有的。图片是一张静图，长边一般不超过约 1280 像素；视频是封面帧。观察方在会话里画它，原图只在打开时取。
- **`blob`**：原文件，在指针 `owner` 那台上。旧写法是 `path`，在记录的持有方。

尺寸和 `thumb` 让框在图到达前就是最终大小：先显示放大、模糊的 `thumb`，`preview` 到了在原地换上；没有 `preview` 的，照旧换上原图。
观察方拿指针找 Coda 取。旧写法没有写在哪台，读的是记录持有方的 `/v1/plugins/<provider 插件>/services/<service>/<preview 或 path>`；路径原样接在后面，Provider 写它时就按 URL 路径编码好，不以 `/` 开头。
字节、Range 和流中断语义沿用 Coda 的本机流式服务。

取不到时这样降级：

- `blob` 取不到（回 404，即 `owner` 那台上没有原文件，比如微信还没下载；或 `owner` 连不上）而有 `preview`：显示预览图，并注明原文件暂时取不到，不当成「文件已清理」；
- 旧写法取 `path` 回 404 而有 `preview`：显示预览图，并注明原图不在持有方，不当成「文件已清理」；
- 没有 `preview` 或 `preview` 也取不到（指针的 `owner` 连不上和 404 一样）：退回 `thumb`；
- 三档都没有或都取不到：显示文件卡。

缺字段时这样降级，旧消息不补算：

- 缺 `width`、`height`：按默认比例占位；
- 缺 `thumb`：图到之前是空框；
- `blob`、`preview` 都没有（旧写法里是没有 `path` 和 `preview`）：只显示文件卡，不能打开原文件。

一个图片 part：

```json
{"type": "image", "name": "IMG_0412.jpg", "size": 2310144, "mime": "image/jpeg", "width": 3024, "height": 4032,
 "thumb": "/9j/4AAQSkZJRgABAQ…",
 "blob": {"owner": "0947ce49-321d-4d63-bd66-415fb6a0ebce", "path": "plugins/wechat/services/media/msg/m7/IMG_0412.jpg"},
 "preview": {"owner": "0947ce49-321d-4d63-bd66-415fb6a0ebce", "path": "plugins/wechat/services/media/msg/m7/IMG_0412.preview.jpg"}}
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

## coda/resource@1

插件持有的一种资源类型在一台机器上的现状，复数名是 `resource-types`。一条记录是一台机器上一个插件的一个资源类型，`key` 是类型 ID；记录由插件的记录命令写，资源页只读记录、调操作。整条记录编码后不超过 64 KiB，schema 不另设字节上限，由 Coda 在写入时查。`status` 是 `{}`，不用。

spec：

| 字段 | 含义 |
| --- | --- |
| `type` | 必填，类型 ID，和 `key` 相同（读别家记录的页面拿不到 `key`）；schema 比不了两者，由 Coda 查 |
| `title` | 必填，类型名，一行，至多 40 字 |
| `resources` | 必填，至多 50 项；没登录的类型写空数组 |
| `signIn` | 可选，`{ installed, installable, input?, note? }`：没写就是不能从 Coda 登录；`installed` 是登录用的程序装好了没有，`installable` 是有没有 `install` 命令，`input` 只认 `authorizationCode`（登录页给出授权码要贴回来），`note` 是登录前的一句话，至多 200 字 |

`resources` 每项 `{ name?, identity?, values, error?, buttons }`：`name`（至多 80 字）与非空 `values` 至少有一样；`identity` 至多 200 字，只用来比较；`error` 一行，至多 80 字。

- `values` 至多 8 项，每项 `{ label?, value?, fraction?, time? }`：`value`（至多 80 字）与数值 `fraction`（0–1）至少有一样；`time` 是 ISO 8601 时间。
- `buttons` 至多 8 项，每项 `{ label, action | view | url, args?, confirm?, disabled? }`，`action`、`view`、`url` 三选一：`action` 调 `act` 操作，`view` 打开本插件的视图，`url` 只认 https（至多 2000 字），不带 `args` 与 `confirm`。`args` 是 JSON 对象，序列化后至多 4096 字节；JSON Schema 说不了字节数，schema 不查，由宿主在写记录和收 `act` 调用时检查。`action`、`view` 有没有对应的动作与视图 schema 查不了：不认识的动作由 `act` 失败，不认识的视图由页面打开时失败。

三个操作都是立即结果 `{}`，不分 `safe`：

| 操作 | 输入 | 期限 | 说明 |
| --- | --- | --- | --- |
| `act` | `{ action, args }` | 10 分钟 | 做按钮上的动作，由插件的命令按 `action` 分派；`args` 必填，没有参数的按钮传 `{}` |
| `sign-in` | `{}` | 15 分钟 | 进度 `{ url, code? }` 报登录链接（和设备码）；`signIn.input` 为 `authorizationCode` 时提问 `{ input: "authorizationCode" }`，回答 `{ code }` |
| `install` | `{}` | 10 分钟 | 装上登录要用的程序 |

```json
{
  "key": "claude",
  "spec": {
    "type": "claude",
    "title": "Claude",
    "resources": [{
      "name": "leavan",
      "values": [{"label": "5 小时", "value": "80%", "fraction": 0.8, "time": "2026-11-20T08:00:00.000Z"}],
      "buttons": [{"label": "移除", "action": "remove", "args": {"id": "a1"}, "confirm": "确定移除？"}]
    }],
    "signIn": {"installed": true, "installable": false, "input": "authorizationCode"}
  },
  "status": {}
}
```

## coda/card@1

会话向用户或上层 Agent 要的一个输入。复数名是 `cards`。由提出它的会话所在的后端持有；持有方可以按自己的表读穿给出，不另存。运行等它时，`coda/run@1` 的 `status.awaiting` 指向这条记录。卡片自己没有操作。

spec：

| 字段 | 含义 |
| --- | --- |
| `kind` | 卡片种类，如 `permission`、`form`、`workflow_task` |
| `title` | 一行标题 |
| `thread` | 提出它的会话，持有方给的 ID |
| `location` | 提出它的会话在哪台机器，给人看；本机的不写 |
| `answers` | 谁能答：`user` 只有用户，`any` 上层 Agent 也能代答 |
| `shown` | 代答的 Agent 要看的内容，对象；`answers` 为 `user` 时不写 |

spec 不带答案的 schema：答案的形状由卡片种类定，持有者在收到答案时校验。

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
