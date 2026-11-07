# 变更记录

按 semver。协议自己的大版本写在协议名里（如 `coda/run@1`），与 npm 包版本、插件清单的 v2 独立；更早的版本见 git 历史。

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
- `docs/protocol.md`：名字、版本、短名推导、调用信封与五个核心协议。

## 2.6.0 — 2026-11-07

- 工作流卡片的链接接受 iOS OTA 安装链接：新 format `link-url` 接受 https 网址，或 `action=download-manifest` 且 `url` 解码后为 https 网址的 `itms-services:` 链接（#25）。

## 2.5.0 — 2026-11-07

- 插件清单加 `icon`：插件目录里的 PDF（`light` 必填，`dark`、`template` 可选，同 Agent 的图标），或 SF Symbols 符号加系统色底（`symbol`、`color`）（#24）。
- `description` 写明是一句话简介，长说明放插件目录的 `README.md`。

## 2.4.0 — 2026-11-06

- `contributes.views` 加 `frame`：`document` 由客户端整页滚动、横向锁死；`canvas` 铺满视图、自己滚动；不写暂与 `canvas` 相同（#23）。
