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
- `docs/protocol.md`：名字、版本、短名推导、调用信封与三个核心协议。
