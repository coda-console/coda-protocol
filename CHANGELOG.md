# 变更记录

版本规矩见 README 的[「版本」一节](README.md#版本)。协议自己的大版本写在协议名里（如 `coda/run@1`），与 npm 包版本、插件清单的 v2 独立；更早的版本见 git 历史。

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
