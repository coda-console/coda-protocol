# 运行器与执行请求协议 v1

`executor`（运行器）与 `execution`（一次执行尝试）是 Coda 预定的公共协议，唯一形状定义在
`@coda-console/protocol`。依据是 [coda#2078 已验收草案](https://github.com/coda-console/coda/issues/2078#issuecomment-6554881338)，
2.2.0 按[第 7 步方案](https://github.com/coda-console/coda/issues/2078#issuecomment-6559423071)补齐流程接入：
**无资源或一个资源的一单位**，可独占所申请资源；多单位、多资源原子申请仍未开放。

协议对象版本 `protocolVersion: 1`、本目录的 v1、npm 包版本 2.2.0 和插件清单的 v2 分开演进。
本次只增加契约；不改变 `contributes.executors`，也不宣称 host、scheduler、空间引用解析或账本接口已经实现。

## 定义与登记

`schemas/executor/v1/{executor,execution}.json` 分别描述 `{spec,status}`，公共定义在 `common.json`。
原始 JSON 采用 draft-07，读取原文件时先向 Ajv 登记 `common.json`。模块导出把所需定义包含在每份 spec/status 中，
只留本地 `$ref`；四份 schema 均可由一个全新的默认 Ajv 直接编译，不需自定义关键字、format 或外部 schema 注册。
`spec`、`status` 顶层均为 object。不支持的 `protocolVersion`、未知字段与不合资源命名约定的键明确拒绝。

```js
import { EXECUTOR_PROTOCOL, EXECUTION_PROTOCOL } from '@coda-console/protocol/executor';

// 现行 API 的装配示例：由 host 在提交端和执行端登记，提交端可关闭接活。
await coda.protocols.define(EXECUTOR_PROTOCOL);
await coda.protocols.define({ ...EXECUTION_PROTOCOL, controllers: ['scheduler'] });
```

`EXECUTOR_PROTOCOL` 没有 `target`；`EXECUTION_PROTOCOL.target` 为 `executor`。
两种类型均**没有补充栏**，不声明 append/or 合并；任务、标签、取消和绑定均不经补充者修改。
`controllers: ['scheduler']` 是现行接口的插件 ID 装配，不是协议对 host/scheduler 实现路径的依赖。
其他生产者通过 provider 的本机创建／取消入口操作，不能冒用 `put`。

当前 `protocols.define` 只允许一个插件登记同 kind，定义持久化后不能改变；尚不支持按协议依赖、多实现登记或同 kind 版本迁移。
后续替换 provider 或演进声明须先解决 Coda 通用登记机制，不能仅更换 schema 文件接管既存类型。

信封沿用 `{kind,id,instance,spec,status,revision}`。基座维护 `instance` 与不透明 `revision`；插件原样传回观察到的 revision，
不能解析或自行递增。删除后同 id 重建是新 instance，旧回答不能复用。这里的 schema 校验 spec/status，不校验或重定义信封。
所有 status 都允许 `{}`，表示镜像状态尚未到达，**不能据此判定未开始**；非空 status 必须是一份完整的已知状态。

## executor：配置与本机事实

一个对象对应一个后端实例的执行环境，身份不随显示名或插件版本改变。

| 区域 | 字段 |
| --- | --- |
| spec 必填 | `protocolVersion: 1`、`enabled`、`capacity: Record<resource, 非负整数>`、`labels: string[]` |
| spec 可选 | `title`（不超过 200 字符） |
| status 能力 | `detectedLabels`、`capabilities: {os,arch,nodeVersion,graphicalSession}`；可选 `xcode: {version,build}`、`simulatorRuntimes: [{id,version,available}]` |
| status 资源 | `capacity`、`occupied`、`available`，各为 `Record<resource, 非负整数>`；`accepting` |
| status 观察 | `observedAt`、`observedRevision`；可选 `reason: {code,message}` |
| status 支持 | `executionFeatures: {multiResource: false,multiUnit: false,exclusive: boolean}`；可选 `noResources`、`namedResources`、`context` 布尔值 |

非空 status 除明确可选项外全部必填。`graphicalSession` 是 boolean 或 null；null 表示无法确定。
探测失败写 `reason`，不将失败变成用户标签或伪造能力；可选探测项未知时省略。
探测只读，不启动模拟器。`observedRevision` 对应探测时采用的配置版本，而非要求它等于之后每次 status 写入产生的 revision。

标签使用小写字母、数字、`.`、`_`、`-`，以字母或数字起始，每项最多 40 字符、每列表最多 64 项、不重复。
`requirements.labels` 沿用 runsOn 的**全部满足**语义，匹配用户标签与探测标签的并集。
保留 OS 标签 `darwin/linux/win32/aix/android/freebsd/openbsd/sunos/cygwin/netbsd/haiku`、架构标签
`arm/arm64/ia32/x64/loong64/mips/mipsel/ppc/ppc64/riscv64/s390/s390x`、`gui`，以及 `xcode-`、`ios-`、`node-` 前缀给探测结果。
spec.labels 只能加自定义标签，不能写这些保留值。精确版本和 simulator runtime ID 另外保存在结构化能力中。

`slots` 的单位是执行名额，host 映射到同一本机 `host` 账本；scheduler 比较资源键与数量，不硬编码 `group === 'host'`。
容量可大于 1；**每次请求量仍只能为 1**。其他本机命名组用 `group:<原名>`，原名为 1–100 个非空白、非控制字符；
`group:host` 拒绝，host 唯一映射是 slots。容量 map 可以为空或含至多 128 个独立资源，这不表示支持一个请求同时申请多个资源。
未报告的资源不能按无限容量或 0 占用处理。有能力不代表有名额。

`noResources`、`namedResources`、`context` 只有显式 true 才表示支持无资源请求、命名组请求、受控运行上下文；
省略表示未声明支持。scheduler 必须按请求用到的能力筛选，不能将旧执行器当作支持新形状。
命名组在本版本仅允许本机执行，由适配层判断归属；不凭带 `group:` 的字符串授权远端资源映射。
缩容量允许 occupied 暂时大于 capacity，此时 available 归零并停止新准入，不强杀已有任务。
占用含旧流程与 run-held；借用或独占按账本事实计算，不能简单数 host 自己启动的进程，也不能要求独占时 available 等于 capacity − occupied。
这些跨栏计算和准入状态由实现检查，不加动态 schema 关键字。

对象无 target，配置经运行器持有端更新；**status 只由持有后端的实现者写**，空间层单向复制。
accepting、available、observedAt 都只是最近观察事实，不保证在线，也不是预留凭证；新鲜度阈值与选择策略属于 scheduler。

```json
{
  "spec": {
    "protocolVersion": 1,
    "enabled": true,
    "capacity": {"slots": 2},
    "labels": ["build-lab"],
    "title": "Mac mini"
  },
  "status": {
    "detectedLabels": ["darwin", "arm64", "xcode-26.1", "node-26"],
    "capabilities": {"os": "darwin", "arch": "arm64", "nodeVersion": "26.8.2", "graphicalSession": null, "xcode": {"version": "26.1", "build": "17B55"}},
    "capacity": {"slots": 2},
    "occupied": {"slots": 1},
    "available": {"slots": 1},
    "accepting": true,
    "observedAt": "2026-11-01T07:00:00Z",
    "observedRevision": "opaque-config-revision",
    "executionFeatures": {"multiResource": false, "multiUnit": false, "exclusive": true}
  }
}
```

## execution：一次尝试

正本在发起后端。`run: ResourceRef` 关联已有运行对象，`step?` 关联步骤，`attempt` 是正整数。
重新执行创建新 execution ID 和新 attempt，保留上一尝试，不另造 Run 或会话命令队列。取消不是新尝试。

| spec 区域 | 形状与约束 |
| --- | --- |
| 身份 | `protocolVersion: 1`、`run`、`attempt` 必填；`step` 可选 |
| 源码 | `source` 必填：null、`{snapshot: ResourceRef<sourceSnapshot>}`、`{repository: ResourceRef<gitSource>,commit: 完整 SHA}` 三选一；SHA 为 40 或 64 位十六进制 |
| 能力 | `requirements: {labels: string[]}`，可为空列表 |
| 资源 | `resources: {}`、`{slots: 1}` 或 `{ "group:<原名>": 1 }`；`exclusiveResources` 默认 `[]`，至多独占申请的那一个资源 |
| 定位（可选） | `placement: {locality?: "local"或"any", executor?: ResourceRef<executor>}`；省略 locality 等同 any |
| 上下文（可选） | `context: {workflow?,plugin?,audience?,outputNames?}`，见下文 |
| 任务 | `{script,shell}` 或 `{command,args}`，严格二选一；程序名与参数不隐含 shell |
| 环境 | `workingDirectory` 默认 `.`；`env: Record<string,string>` 必填，只含声明变量，可为空对象 |
| 时限 | `timeoutMs?` 正整数；`cancelGraceMs?` 非负整数；缺省策略由执行实现决定 |
| 取消 | `cancel` 默认 false，是单向意图 |
| 绑定 | `executor: ResourceRef<executor>\|null`、`assignmentId: string\|null` 必填，两者同为 null 或同时有值 |

独占是 `exclusiveResources: [资源键]`，而非把“全部名额”换成某次观察到的容量数字。
空 resources 只允许空 exclusiveResources；非空时独占键必须与请求键一致，schema 检查数量和命名，执行方核对二者关系。
生产端必须先看 `executionFeatures.exclusive`；不支持独占的执行方明确拒绝，不降级为普通名额。
原 coda:group 由生产端／资源 provider 声明映射；runsOn 放入 labels，两者独立。

workingDirectory 是源码根下的相对路径；没有源码时相对执行方隔离目录。
schema 拒绝绝对路径、盘符、反斜线、控制字符和 `..` 路径段；执行方仍须检查真实落点、符号链接和来源权限。
工作树先由提交端制成 ready 快照，执行端读取快照的精确 commit/ref，不重新抓取“最新工作树”。
env 不等于提交机进程环境；沿用 hook 的声明变量、密文与鉴权边界，不把本机凭据或绝对路径放进跨机 spec。

JSON Schema 的 default 只声明缺省值。单独使用默认 Ajv 校验不会填值；现行 Provider 用 `useDefaults` 补齐
`workingDirectory`、`exclusiveResources`、`cancel`。不使用 default 填造任何 status 事实。

| 非空 status | 约束 |
| --- | --- |
| 基本 | `phase: queued\|preparing\|running\|finished` 与 `assignmentId` 必填；可选 `reason` |
| 进度 | 可选 `startedAt`、`executionRun: ResourceRef`、`admission: {lease,slots}`；running 三者必填 |
| 准入 | 无资源请求 admission 为 null；占资源时为 `{lease,slots,resource?}`，resource 省略表示 slots。slots 是非空且不重复的非负名额序号数组，独占可记录多个序号 |
| 完成 | finished 必须给 `finishedAt`、`outcome: succeeded\|failed\|cancelled\|rejected`；其他 phase 不接受 finishedAt、outcome、exitCode |
| 结果 | 可选 `exitCode: integer\|null`、`outputs`、`summary`、`outputTail`、`logs`、`artifacts` |

preparing/running 必须有 assignmentId；succeeded/failed 还必须有 startedAt 与 assignmentId。
取消可在未绑定、未启动时完成；rejected 表示本次 assignment 不会启动，不接受 startedAt 或非 null exitCode。
没启动或无法确定退出码时省略或写 null，不能造 0。这些字段的静态组合不能代替实际进程、收尾和状态迁移检查。
独立 spec/status schema 不比较请求与结果：执行方必须保证 admission 为 null 当且仅当请求 resources 为空；
非空准入的 resource 必须等于请求资源，不能用 null、别的组的租约或虚构 lease 绕过占额。

文本限制使用 JSON Schema 的 Unicode 字符数，不是 UTF-8 字节或 UTF-16 长度：summary 最多 4096、outputTail 最多 16384；
outputs 最多 64 项，键 1–128 字符、值最多 4096。logs/artifacts 各最多 64 项。
logs 项为 `{ref: ResourceRef,cursor?}`；artifacts 项为 `{ref: ResourceRef,name,sha256?,size?,mediaType?}`。
引用不接受本机绝对路径代替对象；sha256 为 64 位十六进制，size 为非负安全整数。
任务脚本最多 65536 字符，command/shell 最多 4096，args 最多 256 项、每项最多 16384；
env 最多 128 项，变量名使用字母／下划线起始的常规环境变量名、最多 128 字符，值最多 16384。
数组、键和值都有上限，不能把无限日志复制进 status；完整限制见 schema。
时间统一使用 UTC `...Z`，schema 仅检查日期时间文字的形状，写入方保证日期真实、时序合理。

```json
{
  "spec": {
    "protocolVersion": 1,
    "run": {"kind": "runs", "id": "opaque-run-ref"},
    "step": "check",
    "attempt": 1,
    "source": {"snapshot": {"kind": "sourceSnapshot", "id": "opaque-snapshot-ref"}},
    "requirements": {"labels": ["darwin", "arm64"]},
    "resources": {"slots": 1},
    "exclusiveResources": ["slots"],
    "task": {"command": "npm", "args": ["test"]},
    "workingDirectory": ".",
    "env": {"CI": "true"},
    "cancel": false,
    "executor": {"kind": "executor", "id": "opaque-executor-ref"},
    "assignmentId": "assignment-1"
  },
  "status": {
    "phase": "finished",
    "assignmentId": "assignment-1",
    "startedAt": "2026-11-01T07:00:00Z",
    "finishedAt": "2026-11-01T07:01:00Z",
    "executionRun": {"kind": "runs", "id": "opaque-execution-run-ref"},
    "admission": {"lease": "opaque-lease", "slots": [0, 1]},
    "outcome": "succeeded",
    "exitCode": 0,
    "summary": "检查通过",
    "logs": [{"ref": {"kind": "logs", "id": "opaque-log-ref"}}]
  }
}
```

ResourceRef 的插件可见形状严格为 `{kind,id}`，id 是适配层提供的不透明引用。
示例里的 `runs`、`logs` 是引用示意，不在本协议登记新类型；实际使用现有运行和日志对象的 kind。
适配层必须保持源码、运行、日志和产物的持有者归属，不能把本机 `remote:…` 字符串原样传给另一台便认为能解析。
日志衔接现有运行日志读面；产物这里只预留引用、大小与摘要，字节传输和 sha256 核验仍属后续 artifacts 实施步骤。

## 流程定位与受控上下文

placement 是生产者约束，顶层 executor/assignmentId 才是 scheduler 的实际绑定，两者不可混用。
`placement.executor` 指定具体环境，`locality=local` 限定请求持有端，二者同时满足；约束冲突或目标不可用时排队并报告原因，
不能丢弃绑定后自动选本机。`locality=any` 只放开位置，标签、能力、资源与准入仍须满足。归属由适配层判断，不解析 ID、拼机器参数。
绑定前后执行方都应检查 placement；schema 不检查引用的实际归属或两个 executor 引用相等。

流程方言可在 process、subProcess、scriptTask 写 `coda:placement="local|any"`。
任何祖先的 local 都是硬限制，子节点 any 不能放宽。未写 placement 且无有效 runsOn 的脚本由流程生产者设置 local；
有 runsOn 才默认 any。显式项目绑定与此约束相交，不覆盖本机限制。需要 CODA_ARTIFACTS、桌面或本机安装状态的流程显式写 local。
用户任务和 Coda 动作仍由流程持有端处理，不接受 placement。这些继承与准入规则由宿主实现，解析器只校验和保留声明。

context 是可信流程生产者冻结的事实，不是权限证明，也不是任意环境变量 map：

- `workflow` 若存在，必须完整给出 `name`、`job`、`runId`、`runAttempt`、`sha`、`ref`、`repository`。
  sha 为完整 SHA 或空字符串（不检出）；ref/repository 可为空。执行方生成 GITHUB_WORKFLOW/JOB/RUN_ID/RUN_ATTEMPT/SHA/REF/REPOSITORY，
  并根据本机工作区生成 GITHUB_WORKSPACE、输出与临时路径。生产者必须核对这些值与 run/step/源码相符。
- `plugin: {id,version}` 标记插件脚本来源，不给绝对路径。实际执行还须满足本机安装、版本和项目授权；本阶段插件流程仍由生产者限定本机。
- `audience: "user"` 沿用用户专属结果边界。持有端与执行端必须在对象、日志及结果读面实施可见性，不能仅靠此字符串保护私有内容。
- `outputNames` 是最多 64 个不重复的输出名；明确给空数组表示不返回脚本变量。给出时只回填声明键，未写出的声明输出为空字符串。
  省略沿用普通执行请求的输出收集；不能凭未声明变量泄露私有数据。

所有本机路径、凭据、插件设置、完整进程环境和事件密文均不进入 context。实际组准入后才由执行方生成 CODA_GROUPS，不能信任提交者自报已占额。
context 字段的文本边界见 schema；执行方仅在显式声明 executionFeatures.context 时接收它。

## 写权限、绑定与改派

1. executor 无 target，status 权威是持有端。execution 未绑定时，本机 provider／获准 scheduler 可写 queued 与原因；
   创建时可给 queued，缺失状态是未知。scheduler 只处理本机正本，按观察到的 revision 同次 CAS 写入 executor 与新的 assignmentId。
   绑定是顶层单值，**不走 append/or 补充合并**，不将多个候选合并成绑定。
2. 绑定后任务、源码、身份、资源、需求、placement 与 context 冻结，只可单向设置 cancel；安全改派仅更换绑定两栏。
   空间桥将 executor 翻译成 `coda.pub/target`。执行方只观察 assigned，并核对具体 executor ID 是自己实现的；
   指向后端不表示该后端所有执行环境都可领单。**绑定后只有执行方完整回传 status**，包括字段删除；
   其他节点无权写，持有者不能伪造远端完成。旧 status 按 assignmentId 区分，不能拿旧绑定结果解释新绑定。
3. 未绑定请求可直接选择。已绑定请求只有当前 assignment 明确拒绝，或撤销已确认且证明不会再启动，才可改派。
   对齐 assignmentId、验证拒绝／撤销事实和权限是机制责任，单凭符合 schema 的对象不能授权改派。
   旧 queued、缺 startedAt、空 status、租约超时或节点掉线均不能证明未开始；已开始或是否开始不明，保留原绑定与运行引用并恢复观察。
4. 持有端将不可达作为观察状态展示，不代写执行结果。取消或撤下镜像也不是原进程已停证明。
   自动重试依任务幂等性和重试政策，创建新 attempt；协议不承诺网络分区中的 exactly-once。

## 开跑前的本机账本准入与恢复

执行方须在 prepare／启动前，持久登记 **execution 的 instance + assignmentId**，经同一本机账本原子获得资源与固定名额序号。
调度看到 available 或 binding 成功均不等于准入。普通占资源请求只占指定资源的一单位；独占须走账本独占动作，不能连续读 available 或分批占额模拟。
无资源请求仍须持久登记并确认执行实现，只是不申请租约；不得给无 group 的步骤暗加 slots 限流。
容量冲突可排队或明确拒绝，scheduler 决定是否在满足改派条件后换目标。
多键／多数量原子准入尚未开放，schema 和 executionFeatures 均不宣称支持。

进程和 cleanup 确认结束后才释放；故障期间保留待恢复占用。重启 list-watch 的 ADDED 只能对账，不得再次启动同一 instance + assignment。
旧镜像指纹／revision 防回写不能代替防重复启动。被拒绝的旧结果不能简单换成最新 revision 重交。

`control` 对同对象串行回调；不能 await 整段长任务堵住取消。
办事员登记并启动／跟随持久运行后返回，后续观察更新取消进程组。取消只改 spec.cancel，执行方重读同 assignment 的当前意图，
完成取消与收尾后报告 cancelled；取消不能回退为 false，也不能回写旧请求的结果。

## 与现有执行链的衔接边界

执行保留 `prepare_job / run_script_step / cleanup_job` 三段 hook，以及 `{command,responseFile,args,state}`、准备 state、
日志、退出码、取消进程组、失败也收尾的语义。清单 `command` 是 hook 入口，与 `task.command` 不同。
源码 provider 给出精确 commit/ref 与本机鉴权代理入口；hook 本机路径在执行方生成，不进入跨机 spec。

缓存目录建议 `$CODA_PLUGIN_STATE/workspaces/<source-key>/<slot-index>/`：source-key 来自来源工作副本身份及对象 instance，
不能用 origin URL、提交号或快照 ID 代替；同仓库不同 linked worktree 也隔离。
slot-index 来自本机账本，scheduler 不猜序号；借用也不得使目录重入。日志／响应文件另放尝试目录。
准入后 fetch 精确 ref／commit、核对实际 commit，再 reset --hard 与 clean -fd，保留忽略缓存；cleanup 清理本次临时资源并放开资源，保留缓存副本。
发布／部署仍由对应流程和插件检查已合并提交准入，不因支持快照删除 origin／发布检查。

旧 Executor 发布与 steps/Step 跨机请求由后续消费方切换撤除，不永久保留两套调度真相。
本包只交付标准 JSON Schema 和规范；引用可移植解析、本机鉴权入口、账本准入／取消／释放及稳定序号、恢复日志跟随、
host/scheduler 实现与流程切换均属于各自仓库后续工作。来源权限、时间先后、容量计算、状态迁移和真实路径不伪装成 schema 动态审核器。
