# 变更记录

版本规矩见 README 的[「版本」一节](README.md#版本)。协议自己的大版本写在协议名里（如 `coda/run@1`），与 npm 包版本、插件清单的 v2 独立；更早的版本见 git 历史。

## 6.15.0 — 2026-11-19

- 这是在 6.14.0 之上的次版本（页面绑定需求二，协议包成员）。依据 README「版本」一节：`contributes.endpoints`、`records`、`self` 都不在 `stable/manifest.json`，是内部面，新增可选键、删内部键升次版本；`stable-grows` 与 `test/stable.test.mjs` 不受影响。H6 的协议成员（6.14.0）先合，本成员顺延为 6.15.0。
- 清单 `contributes` 加可选的 `records`：数组，每种记录一项 `{ kind, command, every? }`，不许别的键，至多 20 项，按 `kind` 去重。`kind` 是协议名（复用 `definition.json` 的 `name`）；`command` 是插件目录里的文件（`x-file`，写法同 `protocolImplementations` 的 `commands`）；`every` 可选，写法与 Coda 资源面板的 `maxAge` 同一套（ISO 8601 风格：周 `W`、天 `D`、时 `H`、分 `M`、秒 `S`，只有秒能带小数点，不收年、月，如 `PT5M`、`PT90S`、`P1W1D`），以后资源面板迁成记录时 `maxAge` 就对应 `every`。`every` 不短于 `PT1M` 的下限 schema 表达不了，由 Coda 判，schema 只查时长的写法。`kind` 是不是这个插件 `protocolImplementations` 里的种类，也由 Coda 装载时查。
- 清单 `contributes` 加可选的 `self`：对象，名字（复用 `operationName`）→ 插件目录里的文件（`x-file`），至多 50 个。
- 不兼容：删掉 `contributes.endpoints`：删去 `schemas/plugin/endpoints.json` 与 `plugin.json` 里的引用。`extension-points.json` 里保留键名单的 `endpoints` 留着，第三方仍不能把它当扩展点的键；保留名单另加 `records`、`self`。清单里再写 `contributes.endpoints` 的结果与别的不认识的键一样：不查形状，`manifestProblem` 通过；旧清单判不判兼容由 Coda 定。

## 6.14.0 — 2026-11-19

- 这是在 6.13.0 之上的次版本。依据 README「版本」一节：协议定义是内部面，新增可选字段升次版本；`contributes.events` 是试行面，不在 `stable/` 里，删它不动稳定面（先例见 6.12.0 删 `contributes.groups`），`stable-grows` 与 `test/stable.test.mjs` 不受影响（Coda 宿主设计 coda#2749 H6）。
- 协议定义加可选的顶层 `events`：事件名 → `{ description?, payload, starts?, ends? }`，不许别的键，至少一条、至多 50 条。事件名是点分的全名（沿用原 `contributes.events` 的写法：「域.名」，小写字母、数字和「_」，以字母开头，至少两段，至多 100 个字符），`coda/` 以外的协议不能用 `workflow`、`session`、`user` 做域。`payload` 是载荷的 JSON Schema，顶层不能定义 `coda`（留给宿主）；`starts: false` 表示不开新流程、只交给已在跟这个主体的运行，`ends: true` 表示这个事件结束它的主体。事件的版本就是协议的大版本。`definitionProblem` 还查每个事件的 `payload` 能编译。
- 权限组加可选的 `events: [事件名…]`（不重复）。`definitionProblem`：组里列的事件必须在 `events` 里；每个事件最多属于一组；有 `events` 的组只放事件：`events` 至少一项，`operations`、`streams`、`read` 这几个键不能出现，按键在不在判断，写成 `[]` 或 `false` 也不行；「每组至少管一样东西」把 `events` 算进去。不在任何组里的事件不对插件开放。
- 只有事件的协议：写了 `events` 的定义可以不写 `spec`、`status`、`operations`；`spec` 与 `status` 要么都写要么都不写。没写 `events` 的定义照旧三者必填。没有记录（没写 `spec`、`status`）的协议不能有非空的 `operations`、非空的 `streams`，也不能有 `read: true` 的组，这些都按记录寻址；要就须同时写 `spec` 和 `status`。`protocol.mjs` 导出 `protocolHasRecords(definition)`：有 `spec` 才有记录，Coda 据此不把只有事件的协议列成记录种类。
- 不兼容：删掉 `contributes.events`：删去 `schemas/plugin/events.json`。事件改写在协议定义里。`extension-points.json` 里保留键名单的 `events` 留着，第三方仍不能把它当扩展点的键。清单里再写 `contributes.events` 的结果与别的不认识的键一样：不查形状，`manifestProblem` 通过。

## 6.13.0 — 2026-11-19

- 这是在 6.12.0 之上的次版本（6.12.0 由 H9-B 在途，版本号暂排其后，合并时跟上 main 再顺延）。依据 README「版本」一节：清单新增可选根键，旧清单照旧通过；这一键进稳定面，`stable/manifest.json` 加 `engines.coda`，`revision` 加到 3（Coda 宿主设计 H7-A，第 10 题）。
- 插件清单根加可选的 `engines.coda`：插件要的最低 Coda API Level，正整数；不写视为不限。写了 `0`、负数、小数或字符串，`manifestProblem` 报 `engines.coda`。`engines` 里的其余键（如 `node`）照旧不管，不报错。本包只管形状；API Level 的常量、快照与兼容判定由 Coda 实现。

## 6.12.0 — 2026-11-18

- 这是在 6.11.0 之上的次版本。依据 README「版本」一节：`contributes.groups` 与流程方言都是内部面，删改、新增可选参数升次版本。`stable/manifest.json` 里没有 `groups`，删它不动稳定面，`stable-grows` 与 `test/stable.test.mjs` 不受影响。
- 流程方言：`hold-group` 加参数 `select`，按池子借：逗号分隔的 `键=值`，全部与组记录的 `attributes` 相等才算匹配，只匹配 `attributes`，如 `platform=android`、`platform=ios,model=duo`；`group`、`select` 恰写一个，两个都写或都不写，读流程就拒（`group、select 须恰写一个`）。`select` 写成纯文本时读流程就按 `键=值(,键=值)*` 查（键是 1–100 个不含空白、「=」「,」的字符；值是 1–100 个不含「=」「,」的字符，中间可有空格如 `model=Mi 10 Pro`，首尾不能是空白；长度按字符计，补充平面字符算一个），写成表达式或含 `{{ … }}` 时留到运行时。输出 `group` 是实际排到的那个组的名字。脚本步骤上的 `coda:group` 不加选择器。`workflow/actions.json` 的动作定义因此多了 `oneOf`（列出的参数恰写一个）与 `pattern`（参数写成文字时的写法）。
- 不兼容：删掉 `contributes.groups`：删去 `schemas/plugin/groups.json`。名额不再由插件在清单里声明，改由插件写 `coda/group@1` 记录，容量取记录的 `capacity`（不写为 1）。`extension-points.json` 里保留键名单的 `groups` 留着，第三方仍不能把它当扩展点的键。清单里再写 `contributes.groups` 的结果与别的不认识的键一样：不查形状，`manifestProblem` 通过。README 里 `contributionProblem` 的示例改用 `modelProviders`。

## 6.11.0 — 2026-11-18

- 这是在 6.10.0 之上的次版本。依据 README「版本」一节：协议定义是内部面，新增可选字段升次版本；`stable/` 不动，`stable/manifest.json` 与 `stable/view.json` 没有任何协议定义的字段，清单与页面接口都没变，旧清单、旧定义照旧通过（Coda 宿主设计 coda#2749 第 12 节，只读记录流）。
- 协议定义加可选的顶层 `streams`：流名（写法同操作名，复用 `operationName`）→ `{ description?, input }`，不许别的键，至多 50 条。流是挂在记录 `{ kind, id }` 上的只读字节流入口，和查询、操作并列；`input` 是参数的 JSON Schema（与操作的 `input` 同一写法），参数都来自查询串，是字符串。`definitionProblem` 还查每条流的 `input` 能编译。
- 权限组加可选的 `streams: [流名…]`（不重复）。`definitionProblem` 的规则与操作同构：每条流最多属于一组；组里列的流必须在 `streams` 里；「每组至少管一样东西」把 `streams` 算进去（有操作、有流，或 `read` 为 true），所以只管流的组合法。不在任何组里的流不对插件开放，只有 Coda 自己和它的客户端读；不写 `streams` 的定义照旧合法。
- 本包只管声明的形状；路由、放行与出流由 Coda 实现。核心协议的定义本版不声明流，由 Coda 后续随实现一起加。

## 6.10.0 — 2026-11-18

- 这是在 6.9.0 之上的次版本。依据 README「版本」一节：协议定义是内部面，新增可选字段升次版本；清单新增可选根键 `uses`，旧清单照旧通过（Coda 宿主设计 coda#2749 H3）。
- 协议定义加可选的顶层 `permissions`：权限组名（写法同操作名）→ `{ title, trial?, operations?, read? }`，不许别的键。`title` 是给用户看的一句话；`trial` 标试行；`operations` 是归这组管的操作（不重复）；`read` 管读这个协议的记录（get、list、watch）；写记录只许实现方，不分给插件，所以没有 `write`。写了 `permissions` 的定义，`definitionProblem` 还查：每个操作最多属于一组；组里列的操作都存在；每组至少管一样东西（有操作，或 `read` 为 true）。不在任何组里的操作不对插件开放，只有 Coda 自己和它的客户端调；不写的定义照旧合法，整个协议都不对插件开放。
- 插件清单根加可选的 `uses`：键是带大版本的协议名，值是权限组名的数组，至少一项、不重复；组名与操作名共用 `definition.json` 的 `operationName`。放在根上而不是 `contributes` 里：Coda 把不认识的 `contributes` 键当扩展点，旧版本会因此拒装；根上的未知键旧版本会忽略。本包只管形状，协议和组在不在目录里由 Coda 校验。`stable/manifest.json` 加 `uses.*[]`，`revision` 加到 2。
- `coda/run@1`、`coda/agent@1`、`coda/session@1`、`coda/environment@1` 写上权限组，全部标 `trial: true`（它们都不在 `stable/` 的稳定面里）：`coda/run@1` 的 `read`、`cancel`；`coda/agent@1` 的 `read`、`spawn`；`coda/session@1` 的 `read`、`post`（`draft` 是客户端输入框的击键流，不分组，不对插件开放）；`coda/environment@1` 的 `read`。分组与说明见 `docs/protocol.md`「权限组」。`coda/card@1` 不动（`coda/executor@1` 已在 6.9.0 删除）。
- 定义的 `permissions` 不入稳定面：协议定义本来就是内部面，`stable/` 里没有任何定义的字段；只有清单的 `uses` 是第三方会写的正式键。

## 6.9.0 — 2026-11-18

- 这是在 6.8.0 之上的次版本。依据 README「版本」一节：协议定义是内部面，删改升次版本，先例见 6.4.0（删去 `coda/run@1` 的 `answer`）。
- 不兼容：删掉 `coda/executor@1`（执行器子系统退役：步骤只在本机跑，这种记录已经没有读者；Coda 宿主设计 coda#2749 第 11 节）。删去 `schemas/protocol/v1/executor.json` 与导出 `EXECUTOR_PROTOCOL`，`CORE_PROTOCOLS` 由六项变五项（`coda/run@1`、`coda/agent@1`、`coda/session@1`、`coda/environment@1`、`coda/card@1`），README 与 `docs/protocol.md` 的介绍和测试同步。别的协议没有引用它。流程里的 `coda:runsOn` 与插件清单不受影响。

## 6.8.0 — 2026-11-17

- 这是在 6.7.0 之上的次版本。依据 README「版本」一节：清单的通用键放宽写法、旧写法照旧通过，升次版本（Coda 宿主设计 coda#2749 第 4、5 节与 6.7 节）。
- `contributes.protocolImplementations` 的每一项除了协议名（文本，这个协议的全部操作由模块实现），也可以是对象 `{ kind, commands }`：`kind` 是协议名；`commands` 至少一项，键是操作名（只按定义里 `operations` 键名的格式校验，在不在定义里由 Coda 装载时查），值是插件目录里的文件（`x-file`）；没列在 `commands` 里的操作由模块实现；不允许别的键。上限仍是 100 项。
- 同一个协议在数组里只能出现一次，文本加对象、两个对象也算重复（原来的 `uniqueItems` 管不到混写）。为此 `x-unique-by` 加写法 `{ key, text: true }`：文本项按它自己的值、对象项按 `key` 属性的值一并查重；`docs/protocol.md` 同步写清两种写法。已有的纯文本写法不受影响。
- `contributes.commands` 的保留名单改了：宿主 H5 在同一次交付里把 `coda-run`、`coda-event`、`coda-resources` 并成一个 `coda`、删掉旧名（coda#2749 6.7 节第 3 条）。现在插件的命令不能叫 `coda`；`coda-run`、`coda-event`、`coda-resources` 不再保留，可以用。`schemas/plugin/commands.json` 的 `name` 描述同步。
- 版本判断：不升主版本，升到 6.8.0。`contributes.commands[].name` 虽在稳定面，但稳定面条目没有登记取值（`values`），承诺的只是「这个键存在、可写命令名」；保留名是 Coda 自己占用的命令名，插件写 `coda` 会盖掉宿主工具，本就不是被承诺的用法。三个旧名放开是放宽，只多接受；新增的 `coda` 只会拒掉一个从未被承诺、也没有已知插件在用的名字（样本里没有），三道检查都不受影响。

## 6.7.0 — 2026-11-17

- 这是在 6.6.0 之上的次版本。依据 README「版本」一节：协议定义是内部面，新增可选字段升次版本，先例见 6.4.0（`deadline`）。
- `coda/session@1` 的 `status` 加可选布尔字段 `notify`：Provider 写 `true` 表示这条记录来了新消息要提醒用户（观察方推到手机、电脑弹横幅，读到 `head` 后撤掉）；不写或 `false` 不提醒，是缺省，旧 Provider 的记录不会开始提醒。`docs/protocol.md` 的 status 表与说明同步。

## 6.6.0 — 2026-11-17

- 这是在 6.5.0 之上的次版本。依据 README「版本」一节：Agent 接入协议是内部面，新增类别与可选字段升次版本，先例见 6.2.0（`auth_required`）。
- Agent 的执行失败类别（`schemas/agent/failure.json`）加 `kind: session_ended`：Agent 的原生会话或进程已经结束（被杀、崩溃、查询自行结束），不是上游服务问题，不得再借 `service_unavailable` 报告。可带可选的 `input`（`accepted` / `not_accepted`），**不必填**：插件确定时才写，不确定就不写，Coda 按「先核对」处理；不带 `retryAfterMs`、`resetAt`、`login`，带了也不检查。`docs/agent-protocol.md` 新增「原生会话已结束」一节，写清何时报、`input` 三种取值（含不写）的含义，以及插件不重试、策略归 Coda。已有三个类别的含义与必填项不变，旧插件不受影响。

## 6.5.0 — 2026-11-16

- 这是在 6.4.0 之上的次版本。依据 README「版本」一节：Agent 接入协议是内部面，新增可选字段、放宽限制升次版本。
- Agent 接入协议新增「配置探测」（`docs/agent-protocol.md`）：Coda 探测 Agent 的模型与模式目录时，对声明了该能力的 Agent，在 `session/new` 里带 `_meta.coda.probe: true`；入口返回一个只在当前连接里有效的虚拟会话，不建原生会话、不执行 prompt。正文写明声明、请求、会话、配置（逐模型 `session/set_config_option`、恢复默认思考档位、只有 `models` 的 Agent 支持 `session/set_model`）、错误（prompt 回 -32602，未知或失效的 ID 回 -32002）与通知的约定。
- `agent-capabilities.json` 的 `coda` 加 `probe`：用对象声明（通常为 `{}`），允许以后加键，null、数组、布尔、字符串不合。
- 新增 `schemas/agent/probe.json`，校验整个 `session/new` 参数的 `_meta`：`coda.probe` 只能是 `true`，其他键保留；经 `agentValueProblem('probe.json', params._meta, …)` 使用，`_meta` 缺省由调用方跳过。`session/new` 仍是 ACP 的方法，没有加进 `AGENT_METHODS`。可选字段与新 schema，旧 Agent 与旧调用方不受影响。

## 6.4.0 — 2026-11-16

- 这是在 6.3.0 之上的次版本。依据 README「版本」一节：协议定义是内部面，删改升次版本，先例见 6.3.0（#59）、6.2.0（#58）。
- 统一调用的请求信封（`schemas/protocol/v1/request.json`）加可选字段 `deadline`：调用方给的截止时刻，绝对时刻的毫秒时间戳（自 1970 年起的毫秒数，正整数），与调用内核 `@coda-console/kernel` 定时器的 `due` 同一表示；持有方到点触发处理函数的取消，不带时持有方从收到请求起按操作定义里的 `timeout` 算，操作没写就用宿主的默认期限。`invocationRequestProblem` 不带照样通过，带了必须是正整数，字符串、负数、零、小数、null 报问题。可选字段，旧请求不受影响（Coda 宿主设计 coda#2749 6.4）。
- 操作定义（`schemas/protocol/v1/definition.json`）加可选字段 `timeout`：这个操作的默认期限，毫秒数，正整数；调用方没给 `deadline` 时，持有方从收到请求起按它算，不写就用宿主的默认期限，具体数由宿主定，协议不规定。`definitionProblem` 认它，0、负数、小数、字符串、null 报问题。可选字段，已有定义不受影响。
- 不兼容：`coda/run@1` 删去操作 `answer`（连同它的输入、结果格式与测试）；它没有实现也没有调用方，卡片的回答已改走调用内核（coda#2749 6.1）。现在 `coda/run@1` 只有 `cancel`，`idempotent` 的核心操作只剩 `coda/session@1 draft`。`coda/card@1` 的说明不再写「回答走运行的 `answer`」。

## 6.3.0 — 2026-11-15

- 这是在 6.2.0 之上的次版本（6.2.0 见下）。
- 不兼容：删去 Coda A3-3-0（coda#2641）已经删掉的能力的声明。依据 README「版本」一节：协议定义与流程方言是内部面，删改升次版本（6.2.0 是 failure.json 加 `auth_required`，见 #58）。
  - 流程方言删去 `coda:reportTo`、`coda:reportOn`（moddle、取值校验与「reportOn 必须配 reportTo」、结构校验里的分支）和 `coda:placement`（`PlacementProperties`）；写了它们的流程读时按认不出的属性拒绝。定时开始事件的 `coda:scope` 及其只写在定时开始事件上的约束不变。
  - `coda/executor@1` 删去操作 `execute`（连同它的 `$defs`：源码快照 `git/snapshot@1`、`source` 输入等），现在没有操作；spec、status、`EXECUTOR_PROTOCOL` 与 `CORE_PROTOCOLS` 里的登记不变。
  - 删去 `schemas/protocol/v1/remote-caller.json`（记录的远端入口，含 `file_ticket`）与 `docs/protocol.md` 里的对应正文。
  - `coda/session@1` 的 `post`、`draft`，以及 `coda:runsOn`、`coda:source`、`group`、`hold-group`、`coda/run@1` 都保留；`coda:runsOn` 的说明改成：对本机执行环境的要求，不符合就一开始失败，不会把步骤交给别台。

## 6.2.0 — 2026-11-14

- Agent 的执行失败类别（`schemas/agent/failure.json`）加 `kind: auth_required`：Agent 的登录凭据失效（OAuth 令牌过期或被撤销），须用户重新登录才能继续；可带可选的 `login`（1 到 200 字，指出要重新登录的账号或登录方式），不带 `input`、`retryAfterMs`、`resetAt`，带了也不检查。`docs/agent-protocol.md` 的「执行失败」写清三类的用途：`service_unavailable` 会自己好，Coda 退避后在同一会话续；`quota_exhausted` 到恢复时间再续；`auth_required` 提醒用户重新登录，登录后续；额度不足与要重新登录两类本轮内不即时重试、也不进入服务故障重试，之后的续跑由 Coda 在同一会话里决定；并写明什么时候该报它、什么时候不该报（API key 配错、权限不足仍是普通错误）。握手阶段回 -32000 的「未登录」不变。新增类别与可选字段，旧插件不受影响（Coda #2642）。
- 额度不足（`kind: quota_exhausted`）可带可选的 `input`（`accepted` 或 `not_accepted`），含义与何时报同 `service_unavailable`（`accepted` 是输入已经进入原生会话，`not_accepted` 是明确拒绝、输入尚未进入原生会话，无法确定就省略）；写了就校验取值，写别的值校验不过。Coda 只用它决定续跑时发什么（`not_accepted` 重发原输入，`accepted` 接着做，没报按不确定处理：带上原输入、先核对再接着做），不会因它进入服务故障重试；`retryAfterMs` 仍不采用。可选字段，旧发送端可不写、旧接收端可忽略。
- 动作 `send-session` 加可选参数 `resumes`（要续跑的那条输入的 ID，须是 `session` 指定的会话、不写就是运行所属的会话里的输入）与 `how`（`original` 原样重发那条输入的完整内容，`verify` 先核对已经做了什么、再接着做，同样带上完整内容；只写 `resumes` 时按 `original`）：写了 `resumes` 时 `text` 只是存在会话里给人看的一句短说明，发给 Agent 的是那条输入的完整内容（附件、引用都在），不再抄成一条新消息的文字（Coda quota-resume 流程）。`actions.json` 的动作加两种约束：`requires`（写了某参数就须写它列出的参数）与 `enum`（某参数写成文字时的取值，表达式与 `{{ … }}` 不查），读流程时检查：`how` 须与 `resumes` 一起写，且只能是 `original` 或 `verify`；`resumes` 是否这个会话里的输入由实现方在运行时检查。只加参数与约束，已有流程不变。

## 6.1.0 — 2026-11-14

- 卡片字段加多选 `choices`（输入字段，须有 `id`、`label`，`required` 默认 true，表示至少勾一项）：`options` 是选项表，`default` 是初始勾上的选项 id，两者都是内容属性，可写表达式在任务打开时读，读出（或写下）的是 JSON 数组或它的文字。选项 `{ id, label, detail?, disabled? }`：`id` 一行、1–64 个字、前后不带空白、表中不重复，`label` 一行、1–80 个字、前后不带空白，`detail` 一行不超过 200 字，`disabled` 为 true 的列出但不能勾；1–32 项，至少一项能勾。`default` 的 id 不重复，每个须是 options 里能勾的一项（两者都已知时读流程就查）。答复是勾中项的 id 组成的数组，按 options 的顺序，在 `answer.values.<id>` 里交来，流程读 `=<任务>.values.<id>`（FEEL 列表），`filled.<id>` 为勾了至少一项。choices 是输入字段：答复的 `fields` 可以引用它，带它的任务只交给用户（`structure.json` 的 `inputFields` 加上它）。moddle 的 `coda:field` 加属性 `options`。
- 值的关键字加 `x-among`（`{ property, key, match? }`）：数组的每一项是同一对象里 `property`（数组或它的 JSON 文字）某一项的 `key`，且那一项合乎 `match`；`property` 还没读出（定义里的表达式）时不查。
- 动作 `check-setting` 加参数 `machines`（建议写入的机器：空间里机器的 ID 或名字，JSON 数组或逗号分隔；不写时是空间里装了这个插件的每一台，不在空间里时是本机，写了 `project` 时只有目录所在的那台）；`valid` 加输出 `machines`（choices 字段的 options：各台，`id` 为机器 ID，离线、不合法的在 `detail` 写明，不合法的 `disabled`）与 `selected`（choices 字段的 default），`before` 改为各台这一层的现值，值相同的合成一份，`after` 仍是一个。`apply-setting` 写到卡片最后一个 choices 字段勾中的各台（卡片没有 choices 字段时同 6.0，只写本机或目录所在的那台），逐台写、部分成功保留、不重试，加输出 `results`（逐台 `machine`、`name`、`result` 为 `written`、`offline`、`not-installed`、`refused` 或 `failed`，以及 `reason` 或 `layer`、`value`）、`written`、`failed`；`layer`、`value` 照旧，为第一台写成的那台的。参数与输出都只加不改，已有流程不变（Coda 内置能力 change-setting 写到多台）。
- 有输入字段的任务只交给用户这条报错的末尾加「（choices 字段也是输入字段）」，前面的说法不变。

## 6.0.0 — 2026-11-14

- 不兼容：流程方言删去流程种类，流程只靠挂点（`<coda:join hook=…/>`）互相找到，「只运行已合并的提交」只由 `coda:mergedOnly` 声明。删去流程属性 `coda:kind` 与 `coda:deploy`（moddle 与 `values.json` 里都没有了，写了的流程读时按认不出的属性拒绝）；`dialect.json` 删去 `kinds` 与 `deploying`，`workflow.mjs` 不再导出 `WORKFLOW_KINDS`、`DEPLOYING_KINDS`；删去动作 `workflow-kinds`；`run-workflows` 删去参数 `kind`，`hook` 必写（`actions.json` 的动作加 `required`，读流程时没写的报「须写参数」）；设置的 `items.anyOf` 选项删去 `workflowKind`，写了的清单校验不过（Coda #2521 第 5 步）。
- 不写 `coda:mergedOnly` 就是 false：任何提交都能跑，不再由种类推出。

## 5.17.0 — 2026-11-13

- 勾选项可带输入：`coda:join` 加 `inputs`（加入者要从卡片拿的自己的文字参数，逗号或空格分隔，最多 4 个；读流程时检查每个都是本流程 type 为 string 的 `coda:input`、不重复，且上卡片时的 id 与 label（没写 label 用参数名）合乎勾选项输入的限制），`joinInputNames(join)` 读出这些名字。`workflow/options.json` 的勾选项加可选的 `inputs: [{ id, label }]`（一项最多 4 个、id 不重复），勾上这一项时卡片上出现这些文字输入，几项带同一个 id 时只出一个；`hook-joiners` 的列表项带上它们。只加写法，已有流程不变（Coda #2521 第 4 步）。

## 5.16.0 — 2026-11-13

- 不兼容：删去三个没人用的清单键。`contributes.executors`（连同 `schemas/plugin/executors.json`，`SCHEMAS` 里不再有它；扩展点仍不能取名 `executors`）、`contributes.agents[].lifecycle`、`contributes.endpoints[].checks`（`x-unique-by` 只剩 `id`）。写了 `lifecycle` 或 `checks` 的清单校验不过。这三个键没有第三方在用，不在稳定面里，属于内部面，按 coda#2463 内部面不为它升大版本，只升次版本；`$id` 不变。

## 5.15.0 — 2026-11-13

- 流程动作加 `check-setting`（参数 `plugin`、`setting`、`value`、`project`）与 `apply-setting`（另加 `approval`）：Agent 提议改一项插件设置，`check-setting` 按设置接口写入的同一套规则检查并给出卡片显示的改前改后（不给 `value` 时读出当前值），`apply-setting` 在用户于 `approval` 任务的卡片上按了主按钮、卡片最后一个 `code` 字段与改后的值逐字相同后写入，流程须来自已装的插件或默认分支。只加动作，已有流程不变（Coda 内置能力 change-setting）。

## 5.14.0 — 2026-11-13

- 流程方言加挂点：流程可写多个 `coda:join`（`hook` 必填，`name`、`detail`、`default` 为 true/false、`order` 为整数，同一流程 hook 不重复），流程属性加 `coda:mergedOnly`（只运行已合并进默认分支的提交，由流程自己声明）。动作加 `hook-joiners`（参数 `hook`、`commit`），`run-workflows` 加参数 `hook`、`only`。只加写法，`coda:kind` 与 `coda:deploy` 不变（Coda #2521 第 2 步）。
- 报错位置里 `coda:join` 以 hook 称呼。
- `coda:mergedOnly` 只认 true、false：与字段的布尔、整数属性一样先按文字读、核对拼写后才换成布尔值，写错的读流程时拒绝，不会被当成 false 放开只跑已合并提交的限制。

## 5.13.0 — 2026-11-13

- 流程方言的答复加 `coda:optionList`：`value` 是表达式，任务打开时读出一组勾选项，在它写的位置展开，与 `coda:option` 按写的顺序排（moddle 里两者同属答复的 `options`，类型 `ChoiceOption`）。打开后的整组由新的 `workflow/options.json` 定义（`{ id, name, detail?, default? }`，最多 12 项，id 不重复），`optionsProblem` 检查它，`CODA_OPTIONS` 导出同一份 schema。只加写法，已有流程不变（Coda #2521 第 1 步）。

## 5.12.0 — 2026-11-13

- 圈定第三方稳定面：随包发布 53 条清单路径及页面接口、外观清单，各从 revision 1 起；增加只增不减、schema 路径可达与第三方清单样本校验，PR 对目标分支、发布前对 npm latest 检查。补充清单的 displayName、version；稳定面只增不减，内部面删改不升主版本（coda#2463）。

## 5.11.0 — 2026-11-11

- Agent 的额度不足标记（`failure.json` 的 `kind: quota_exhausted`）加可选的 `resetAt`：上游给出的额度预计重置时间，UTC ISO 8601 字符串，以 `Z` 结尾，可带 1 到 9 位小数秒；没有确切时间时省略。校验拒绝非法格式；这是兼容扩展，旧发送端可不写、旧接收端可忽略，`service_unavailable` 的约束与语义不变。
- 流程动作加 `send-session`（参数 `text`、`key`、`session`）：在指定会话（默认运行所属的）里提交普通消息，和用户发的一样开始一轮，供额度重置后发送「继续」；同一个 key 只发一次，已归档就不发。

## 5.10.0 — 2026-11-10

- 视图（`contributes.views` 的每项）加可选的 `provides`：作为附件来源时能交回的 part 类型，与 `coda/session@1` status 的 `accepts` 的键同一套，现在只有 `audio`。写了的视图出现在外部会话输入框的「+」里，只列会话 accepts 里有的类型；交回的方式由 Coda 客户端的视图桥定（Coda #2398）。

## 5.9.0 — 2026-11-10

- 流程方言的脚本步骤加 `coda:source`：这一步在哪个工作副本目录里跑（本机绝对路径，可写 FEEL 表达式），只用于 `coda:checkout="false"` 的步骤，须与它同时写。本机就地跑、不检出；交给别的执行环境时，调用方给这个目录所在的工作副本拍快照（含未提交、未跟踪的改动，不含忽略的文件），对方检出快照并在对应的子目录里跑，用的是 `coda/executor@1` 的 `execute` 输入里已有的 `source.snapshot` 与 `workingDirectory`，执行器协议不改（Coda #2078 B2 前置）。

## 5.8.0 — 2026-11-10

- `coda/session@1` 的 status 加可选的 `activity: { participant, text }`：参与者正在做什么，单行、至多 200 字符；停下时删掉，不是消息，不进 `read`，不推进 `head`。
- 新增记录的远端入口（`schemas/protocol/v1/remote-caller.json`）：令牌只通往一条 `coda/session@1` 记录，支持绑定、`hello`、六个只读工具与白名单流程工单 `file_ticket`；调用以记录为 `parent`，结束结果按通知规则以 `self` `post` 回记录。旧 Agent 远端入口保留，随 grok-bot 0.4.0 退役。

## 5.7.0 — 2026-11-10

- 插件提供的模型服务的接口（`contributes.modelProviders` 的 `api`，以及设置的 `modelApis` 可列的接口名）加 `openai-speech`：OpenAI 语音合成接口（`POST /v1/audio/speech`）。只加接口名，字段与语义不变。

## 5.6.0 — 2026-11-10

- 流程种类 `develop`（开发流程）：把一项改动从开工做到合进默认分支，结果交回发起它的会话；任何提交都能跑，不算部署类。设置选项的 `workflowKind` 也接受它。

## 5.5.0 — 2026-11-10

- `coda/session@1` 的参与者（`status.participants` 的每一项）加可选的 `avatar`：`{ service, path }`，头像图片在 provider 插件登记的本机流式服务里的路径，取法同媒体 part 的 `path`。不写或读不到时观察方用名字代替；头像换了 Provider 换一个 `path`，观察方按路径缓存（Coda #2393 之后的外部会话头像）。

## 5.4.0 — 2026-11-10

- Agent 接入协议加通知 `_coda/unrecognized`（`schemas/agent/unrecognized.json`，登记在 `messages.json`）：入口把没适配的东西报给 Coda，参数 `{ sessionId, kind, name, lost, detail? }`。`kind` 为 `output`（上游 Agent 发来、入口没按登记处理的东西，含没送到 Coda 的用户可见文字）或 `tool`（模型能用、入口没登记的原生工具）；`name` 是至多 200 字的稳定标识，只含类型名、字段名与取值，不含用户内容；`lost` 表示用户本该看到的没显示出来，`tool` 一律 `false`；`detail` 至多 2000 字，只用于会话里的说明。Coda 对 `lost: true` 在会话里记一条说明（同一会话同一 `name` 一次），所有上报按 Agent ID、Agent 版本、`kind`、`name`、`lost` 计数，随后端遥测上报，不带 `detail`；缺必填、超长、`kind` 不认识的整条丢弃。
- `clientCapabilities._meta.coda.unrecognized`：Coda 收这条通知；没看到它，Agent 不发。
- 内置入口的说明：Codex 照常显示 `delivery: "async"` 的消息，异步提问（`request_user_input_async`）转成这一轮里的表单卡片，字段写法同 Claude 的提问；Codex 与 Claude 的入口登记上游的每种输出，没登记的、没送到的经 `_coda/unrecognized` 报，会话开始时对照原生工具清单，新工具报 `kind: tool`。

## 5.3.0 — 2026-11-09

- `coda/session@1` 的媒体 part（`read` 的消息与 `post` 的输入）加 `type: "audio"`：一段语音消息（对方平台的「语音条」），不是任意音频文件；用 `name`、`size`、`mime`、`duration`、`service`、`path`，`width`、`height`、`thumb`、`preview` 不用。`path` 给的文件应是常见播放器能直接播放的格式（如 AAC/M4A、MP3、WAV），`mime` 写实际格式，原始编码不能直接播时由 Provider 转换；Provider 给语音消息写可读的 `text` 兜底（例如「[语音] 5″」）。`duration` 改为视频和语音用。
- `post` 输入里的媒体 part 加 `upload`：持有这条记录的机器上 Coda 上传的 ID（`POST /v1/uploads` 返回的，1 到 200 字符），与 `service`、`path`、`preview` 互斥；`read` 的消息里没有。调用方先把文件传到持有方再引用，持有方的 Coda 把上传交给 Provider 读取，Provider 不经网络取；本版本只要求 Provider 对 `audio` 支持。
- status 加可选的 `accepts`：`post` 除文字以外还收哪些媒体 part，形状是 `{ audio?: { maxDuration? } }`，本版本只有 `audio` 一个键，`maxDuration` 是语音最长秒数（大于 0）；不写就是只收文字，客户端据此显示录音入口并到时自动停止。`post` 收到没声明的媒体 part 或超出限制时运行 `failed`，`code` 为 `unsupported`（Coda #2364）。

## 5.2.0 — 2026-11-09

- 新核心协议 `coda/card@1`（复数名 `cards`，`CARD_PROTOCOL`，在 `CORE_PROTOCOLS` 里）：会话向用户或上层 Agent 要的一个输入，由提出它的会话所在的后端持有，可按持有方自己的表读穿给出、不另存。spec 是 `{ kind, title, thread, location?, answers: "user"|"any", shown? }`，不带答案的 schema；status 是 `{ state: "pending"|"submitting"|"answered"|"expired"|"unknown", holder?, reason?, note?, toldAlong?, setAside? }`，`holder` 是字符串（`user` 或会话 ID），不是引用；没有操作。
- `coda/run@1` 加操作 `answer`（立即结果 `{ state? }`，`idempotent`）：回答运行在等的卡片，输入 `{ card, answer, answeredBy?, attachments? }`，`card` 须等于 `status.awaiting`。答案里可能有密钥原文，调用双方都不按 `requestId` 保存这次调用，重复提交由持有者按卡片挡住。`answer` 和 `cancel` 一样按 `spec.record.kind` 交给运行的持有者；`status.awaiting` 指向 `coda/card@1`（Coda S2）。
- `coda/agent@1` 的说明补上：`spawn` 的 `parent` 不是会话、是登记过的调用方记录时，开的是顶层会话，不是子会话。

## 5.1.0 — 2026-11-09

- `coda/session@1` 的媒体 part（`read` 的消息与 `post` 的输入）加可选的 `preview`：同一个 `service` 里预览图的服务内路径（1 到 2048 字符，须和 `service` 一起出现），图片是长边一般不超过约 1280 像素的静图，视频是封面帧。文档把媒体写成三档：内嵌的 `thumb`（只限至多 8192 字符，自己生成时长边取 64 像素左右，Provider 已有的小缩略图可原样放）、会话里画的 `preview`、打开时才取的原文件 `path`；取 `path` 回 404 而有 `preview` 时显示预览图并注明原图不在持有方，不当成文件已清理，`preview` 也取不到时退回 `thumb`，都没有时显示文件卡（Coda #2342）。

## 5.0.0 — 2026-11-09

不兼容变更：

- `coda/session@1` 的 `post` 从立即结果改为开运行（`run: true`），输入不变：发一条消息可能要十几秒到几十秒（排队、按真人节奏输入、发出后确认）。发送者固定是 `self`，重发同一个 `requestId` 得到同一个运行、只发一次；`completed` 的 `result` 是 `{ message: { id, cursor } }`，即以后 `read` 读到的那条；`failed` 的 `result` 是 `{ code, message }`，不确定发没发出去时 `code` 为 `unknown`，调用方显示「结果未知」、不自动重发；取消沿用 `coda/run@1`。协议名仍是 `coda/session@1`，不升大版本：目前还没有第三方实现 `post`。

新增：

- 操作定义的 `idempotent: true`：可以改状态、但重发做的是同一件事的立即结果操作；调用双方和 `safe` 一样，都不按 `requestId` 留请求和回答。只能与 `result` 一起写，不能与 `run` 同时出现；`safe` 已含 `idempotent`，两者不同时写。
- `coda/session@1` 的操作 `draft`（`idempotent`）：设定 `self` 还没发出去的草稿，结果 `{}`。输入 `{ text, version, steps? }`：`text` 是全文（空串为清空），`version` 是非负整数、比大小，Provider 丢掉不大于已见最大版本的，建议用毫秒时间；`steps` 是从上一版到这一版的中间状态 `{ text, delayMs }`，可照节奏回放，最后一步等于 `text`。用户发出时仍调 `post`，全文在 `post` 的输入里，没写过草稿的 `post` 也照常发。

## 4.2.0 — 2026-11-09

- `coda/session@1` 的媒体 part（`read` 的消息与 `post` 的输入）加可选的 `width`、`height`（像素，已按拍摄方向转正）、`duration`（秒）、`thumb`（内嵌 JPEG 的 base64，长边不超过 64 像素，至多 8192 字符）与 `path`（服务内路径，须和 `service` 一起出现）；文档写清原文件在记录持有方的 `/v1/plugins/<provider 插件>/services/<service>/<path>`，Range 与流中断沿用本机流式服务，以及缺尺寸、缩略图、`service` 时怎么显示（Coda #2342 第 1 步）。

## 4.1.0 — 2026-11-09

- 流程属性 `coda:autoRun`：事件（如 PR）来时，会话与目录都没设「自动运行」的，按它决定起不起运行：`true`、`false`，或插件的一项设置 `=vars.<插件>.<设置>`（如 `=vars.review.autoRun`；事件来时还没有运行，别的都读不到，所以只收这种写法），不写为起。手动发起不受它影响（Coda #2303 后续：在插件设置里关掉 PR 生命流程的自动运行）。

## 4.0.0 — 2026-11-09

不兼容变更：

- 插件清单 `plugin.json` 的 `contributes` 只列 11 个通用键（`configuration`、`extensionPoints`、`extensions`、`services`、`setup`、`environment`、`path`、`endpoints`、`views`、`protocols`、`protocolImplementations`）。`capabilities`、`instructions`、`agents`、`groups`、`events`、`commands`、`gitCredentials`、`repositories`、`skills`、`mcpServers`、`modelProviders`、`executors`、`composerModes` 由 Coda 的贡献点登记表声明（Coda #1917）：`manifestProblem` 不再校验它们的形状，只按 `propertyNames` 查键的写法；它们的 schema 文件留在 `schemas/plugin/`，照旧能按文件名从 `SCHEMAS` 取到。
- `validate.mjs` 的 `TYPES` 只含这 11 个通用键。

新增：

- `validate.mjs` 导出 `contributionProblem(schema, manifest, key, dir?)`：把一个键按声明方给的 schema 放在整份清单里校验，指针从清单的根算（如 `groups` 的 `capacity`、`modelProviders` 的 `${config:…}` 指向本插件的设置），`x-file` 在给出插件目录时查；说法同 `manifestProblem`。
- 协议定义的可选 `plural`：给人寻址的复数名（Kubernetes CRD 的 `names.plural`），`^[a-z][a-z0-9-]{0,62}$`，不写就是短名；同一大版本内不可改。
- `coda/agent@1`：`"plural": "agents"`；spec 加可选 `plugin`（提供 Agent 程序的插件 ID，记录的 provider 是写记录的编排）；操作 `spawn`（`run: true`），输入同 Coda 的 `agents`/`spawn`。

## 3.5.0 — 2026-11-09

- 流程参数的 `agent` 类型：值是一组 Agent 选择，与插件设置的 Agent 组合（`format: coda-agent`）相同：`agent`，以及可选的 `model`、`effort`、`mode`、`options`。不写 `default`；`defaultFrom="session.agent"` 是从会话发起、没给值时取那个会话的 Agent 选择，只用于这种参数（Coda #2303 第 4 步）。

## 3.4.0 — 2026-11-09

- `coda/session@1` 的 `read`：都不带游标时读最新的 `limit` 条；写清 `before` 是这个游标之前最新的 `limit` 条、`more` 表示更早还有没有；消息总按先后排；`after` 与 `before` 不能同时带（Coda #2311）。
- `coda/session@1` 的消息加可选的 `senderName`：发送者当时的显示名，大群不必把每个发送者都写进 `status.participants`。

## 3.3.0 — 2026-11-09

- `coda:choice` 的 `note`：`required` 时选它必须附言（写说明或附上文件），默认 `optional`（Coda #2303 第 3 步：卡片在输入框里填写）。

## 3.2.0 — 2026-11-09

- 人工任务的 `coda:wake`：`false` 时派出不叫醒 Agent，任务随会话的下一条输入告诉它（如用户在会话里开启的开发流程，Agent 下次说话时才读到）；只写在交给 Agent 的任务上，默认 `true`。
- `coda:assignee` 的说明跟上 Coda 的处理人规则：先交给 Agent，它处理不了才逐层往上（Coda #2303）。

## 3.1.0 — 2026-11-08

- 流程种类 `prebuild`（预编）：开发流程推出执行者的提交后，在审查的同时调用一次、不等它的结果，为随后验收要装的客户端先编好；任何提交都能跑，不算部署类。设置选项的 `workflowKind` 也接受它。

## 3.0.0 — 2026-11-05

不兼容变更：

- 删除 `executor`、`execution` 两个公共对象协议、`schemas/executor/v1/` 与 `@coda-console/protocol/executor`（`EXECUTOR_PROTOCOL`、`EXECUTION_PROTOCOL`）。
- 执行请求并入 `coda/executor@1` 的 `execute` 操作，运行改由 `coda/run@1` 表达；不再有 `target`、`executor`、`assignmentId` 绑定，也不回写调用方的记录。
- 插件清单的 `contributes.protocolImplementations` 从草案里的 `{ kind, version, id }` 改为协议名列表。
- 删除流程动作 `hand-to-user` 与人工任务的 `coda:handback`；`coda:choice` 的 `id` 不再保留 `handback`。人工任务先给运行所属会话的 Agent 一轮，没答就逐层往上，最上面是用户；`coda:assignee="user"` 与有输入字段的直接到用户。

新增：

- 协议定义格式与 `schemas/protocol/v1/definition.json`；`protocol.mjs` 导出名字解析、格式化、短名、定义校验与命名空间校验。短名至多 63 个字符，超长的协议名被拒绝，不截断、不哈希。
- `contributes.protocols`，以及协议名列表形式的 `contributes.protocolImplementations`。
- 统一调用信封 `schemas/protocol/v1/request.json`、`response.json`；请求带 `parent` 与 `awaited`，记录引用的 `kind` 是协议名。
- 核心协议 `coda/run@1`、`coda/executor@1`、`coda/agent@1`；`execute` 的源码引用使用 `git/snapshot@1`、`git/source@1`。`coda/run@1` 的 `canceled` 可带 `result`，`failed` 的 `result` 约定为 `{ code, message }`，`code: "unknown"` 表示结局不明。
- `_coda/wait` 增加可选 `awaited`；Agent 活动默认在等、挡会话静止，`false` 为单向的「不等它了」；Agent 协议按调用只交回一次改写。
- 核心协议 `coda/session@1`（外部会话：参与者、`head` 游标，操作 `read`、`post`；撤回、编辑、表情用 `about` 指向旧消息）与只读的 `coda/environment@1`（操作 `list`、`read`），导出 `SESSION_PROTOCOL`、`ENVIRONMENT_PROTOCOL`。
- 操作定义的 `safe: true`：只读、没有副作用、立即给结果，只能与 `result` 一起写；调用双方都不按 `requestId` 留它的请求和回答，重发就再做一次。`coda/session@1` 的 `read` 与 `coda/environment@1` 的 `list`、`read` 标为 `safe`。
- `coda/session@1` 消息的 `mentions`：回复一条消息就算 @ 了它的发送者，Provider 把被回复消息的发送者也写进来。
- `docs/protocol.md`：名字、版本、短名推导、调用信封与五个核心协议。

## 2.6.0 — 2026-11-07

- 工作流卡片的链接接受 iOS OTA 安装链接：新 format `link-url` 接受 https 网址，或 `action=download-manifest` 且 `url` 解码后为 https 网址的 `itms-services:` 链接（#25）。

## 2.5.0 — 2026-11-07

- 插件清单加 `icon`：插件目录里的 PDF（`light` 必填，`dark`、`template` 可选，同 Agent 的图标），或 SF Symbols 符号加系统色底（`symbol`、`color`）（#24）。
- `description` 写明是一句话简介，长说明放插件目录的 `README.md`。

## 2.4.0 — 2026-11-06

- `contributes.views` 加 `frame`：`document` 由客户端整页滚动、横向锁死；`canvas` 铺满视图、自己滚动；不写暂与 `canvas` 相同（#23）。
