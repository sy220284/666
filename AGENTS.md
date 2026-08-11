# AGENTS.md

## 1. 项目与权威性

WorldForge 是面向单一作者的本地优先桌面写作工作站，仓库实现冻结的 WorldForge V6.5 基线。

本文件是仓库级完整且唯一的 Agent 权威指令。`agent.md` 仅提供快速入口；发生冲突时以本文件为准。不得在已批准文档之外扩展产品范围、架构、依赖、云服务或任务顺序。

## 2. 强制启动顺序

开始编码、重构、测试、Migration、UI、Prompt、文档、治理或发布前，必须依次读取：

```text
1. AGENTS.md
2. docs/PROJECT_EXECUTION_ENTRY.md
3. docs/tasks/TASK_AUTHORIZATION.json
4. docs/tasks/TASK_INDEX.md
5. 产品任务时读取当前任务Runtime
6. 当前任务卡及其专项文档
7. 现有代码、测试、Migration、契约和追踪状态
```

固定规则：

- `TASK_AUTHORIZATION.json` 是分支模型、PR模型和main写入规则的全局机器真源。
- 当前授权模型固定为Schema 2：`main`稳定主线、`work`产品任务集成lane、`governance`仓库治理集成lane；配置中的`mode: single-work-pr`表示产品任务仍只使用唯一`work`，不否定永久`governance` lane。
- `docs/tasks/runtime/<TASK-ID>.json` 是产品任务状态、允许路径、禁止路径和验证命令的机器真源。
- 新建及活动产品Runtime必须使用Schema 2和`executionBranch: "work"`；治理维护不得伪造产品Runtime。已Verified历史Runtime保持冻结，只允许读取。
- `ACTIVE_TASK.json`、`ACTIVE_TASK.md`与旧`taskctl`兼容入口已经退役，不得重新引入或作为状态真源。
- 动态任务数量、阶段和授权以真实状态文件为准，不在本文固化。

## 3. 文档权威顺序

```text
作者最新明确指令
> TASK_AUTHORIZATION、任务Runtime与TASK_INDEX
> 当前任务卡和批准范围
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> 冻结专项规格、ADR、Schema、契约、UI、安全与P0验收
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> 本文件与执行手册
> 现有实现
```

发现冲突时必须记录冲突来源、影响文件、兼容边界和解决方案，禁止静默选择。

## 4. 产品不变量

### INV-001 本地数据

正文、数据库、设置、索引、日志、Prompt、Eval、配置和备份只能保存在用户本机。禁止云存储、云同步、账号托管后端和WorldForge自有模型代理。

### INV-002 建议稿隔离

AI输出先持久化为建议稿（`Candidate`），只有作者明确采用后才能进入当前稿（`Draft`）。

### INV-003 单一真源

`project.sqlite` 是唯一权威作品数据源。Renderer状态、Tiptap JSON、缓存、全文索引、导出和统计均为派生数据。

### INV-004 代码强制安全

锁定保护、Revision、Hash、不可变历史版本、项目/路径边界和事务完整性必须由代码保证，Prompt不能充当安全控制。

### INV-005 作者裁决权

AI可以提议文本和状态变化，但不得直接修改已确认设定、定稿文本或权威状态。

任一不变量失败必须阻断合并和发布。

## 5. 永久分支与PR规则

仓库长期且只允许三个分支：

```text
main：受控合并后的稳定主线
work：产品任务、产品修复、任务验证、任务文档和Evidence集成
governance：仓库治理、CI、测试治理、流程文档和构建治理集成
```

强制规则：

- 禁止新增或复用 `work/*`、`governance/*`、`feat/*`、`fix/*`、`chore/*`、`policy/*`、`probe/*`、`stage/*`、`validate/*`、`release/*`及其他第四分支。
- 产品正式PR必须精确为 `work → main`；仓库治理PR必须精确为 `governance → main`；来源仓库必须是当前仓库。
- 同一时刻每条集成lane最多一个开放PR；`work`与`governance`可以各有一个PR并行准备，但main写入始终串行。
- 禁止直接向`main`提交；`main`只允许四项永久门禁通过后的Controlled Merge写入。
- 开始新的产品工作前，`work`必须与最新已验证`main`一致；开始新的治理维护前，`governance`必须建立在最新安全基线上。
- 无任务marker的`governance` PR不得修改产品功能、数据库、IPC、Task Runtime或任务Evidence；若范围触及这些内容，必须转入`work`正式任务闭包。
- 禁止验证专用分支、临时治理分支、纯Evidence分支和纯关闭PR。

产品流程：

```text
已验证main
→ work
→ 实施、测试、审查、文档与Evidence
→ Ready PR（work → main）
→ 四项永久门禁
→ Controlled Merge（Squash）
→ Main Verification
→ task-verification/<TASK-ID>
→ Integration Branch Synchronization
→ Branch Inventory/Hygiene
→ 下一任务
```

治理流程：

```text
已验证main
→ governance
→ 治理、CI、测试、流程文档或构建治理修改
→ Ready PR（governance → main）
→ 四项永久门禁
→ Controlled Merge（Squash）
→ Main Verification
→ Integration Branch Synchronization
→ Branch Inventory/Hygiene
```

四项永久门禁固定为：

```text
pr-policy
quality / quality
security
performance
```

`quality / quality`必须聚合Core Quality、Release Audit和Package Gate。Task Governance与Evidence不再作为第五、第六个永久Context。

## 6. 任务状态与关闭

静态声明状态：

```text
PLANNED → IN_PROGRESS → IMPLEMENTED
```

有效状态由任务Runtime、来源PR、来源work Head、最终main SHA和提交状态共同计算：

```text
IMPLEMENTED + Main Verification未成功
→ VERIFICATION_PENDING

IMPLEMENTED + 来源绑定一致 + task-verification/<TASK-ID>成功
→ VERIFIED
```

规则：

- `Implemented`只证明实现已进入受检PR Head，不能充当最终验收或发布资格。
- Main Verification成功后发布 `main-verification`及任务验证状态，不再创建第二个关闭PR。
- Release Gate和后续任务依赖必须读取有效状态，不能只相信Runtime中的静态文字。
- 最终Evidence在合并前记录来源PR和受检Head；合并后的main SHA、验证运行和状态由GitHub提交状态完成闭环。
- 已Verified历史任务、Migration和Evidence保持冻结。

## 7. Integration Branch Synchronization安全条件

Main Verification成功后，永久同步流程同时检查`work`和`governance`。

来源lane只有以下条件全部成立才可同步：

- Main Verification结论为success；
- 当前main SHA等于该验证运行的Head SHA；
- 能解析出已合并的 `work → main` 或 `governance → main` 来源PR；
- 当前来源lane仍等于来源PR受检Head，或该永久分支已缺失；
- 当前没有新的同lane开放PR；
- 来源lane未出现合并后的新提交。

满足后，来源lane按已验证Squash事实受控重置到main。

另一条兄弟lane采用更保守规则：

- 已等于main：保持；
- 无开放PR、没有独有提交、当前Head只是main祖先：仅允许非强制fast-forward到最新main；
- 存在开放PR：明确skip并保留正在进行的工作；
- 无开放PR但存在独有/分叉提交：fail-closed，禁止force覆盖。

每次写Ref后必须重新读取最终Ref确认结果。`governance → main`合并并通过Main Verification后，空闲`work`应自动同步最新main；`work → main`对空闲`governance`同理。

## 8. 整体工程质量

所有修改必须同时评估：

- 横向影响：相邻模块、共享组件、公共契约、共用状态、测试和用户体验；
- 纵向影响：Renderer → Preload → Main → Core → Repository → SQLite，以及任务卡、Migration、IPC、Evidence和发布链路；
- 数据生命周期、失败传播、取消、冲突、幂等、只读、恢复和性能预算。

代码必须保持规范性、健壮性、可读性、可维护性、可测试性、安全性和性能可控性。禁止无关重构、未经批准的生产依赖、TODO、空实现、固定成功、演示假数据、静默吞错和多套真源。

### 8.1 根因治理与局部重写原则

处理功能缺陷、并发竞态、状态污染、错误传播、恢复异常或反复回归时，必须先判断问题属于局部实现错误，还是公共边界、状态所有权、事务边界、错误模型或生命周期设计缺陷。

固定原则：

> 保留成熟且已验证的数据与业务内核，局部重写脆弱的进程通信和异步交互边界；通过统一机制消灭一整类问题，禁止针对每个现象反复打补丁。

固定处理顺序：

1. 识别已验证的不变量、数据模型、事务和业务内核，明确禁止无收益重写的范围；
2. 沿完整调用链定位最早失去约束、所有权或原子性的位置；
3. 检查同类问题是否会在其他调用点、功能域或失败路径重复出现；
4. 根因位于公共边界时，建立单一公共机制并迁移所有受影响调用点；
5. 根因仅属于单一局部逻辑时，实施最小且完整的定点修复；
6. 同步覆盖成功、失败、取消、冲突、超时、重启、恢复和旧结果失效；
7. 复核横向模块与纵向链路，确认问题没有被转移到其他层；
8. 只有统一机制、不变量、调用点和回归测试全部闭环，才能标记完成。

必须优先考虑局部重写的信号：

- 多个调用点重复维护相同的`try/catch/finally`、Pending、重试、取消或错误转换；
- 同一状态被多个模块直接写入；
- 日志、UI状态或缓存能够改变业务结果；
- 超时、退出、发送失败和取消分别维护互不一致的清理路径；
- 修复一个分支后，同类问题持续在相邻功能出现；
- 测试必须依赖固定延时或大量无关初始化才能稳定；
- 公共边界缺少明确的状态机、事务或错误模型。

禁止做法：

- 在多个调用点复制相同补丁；
- 通过增加延时、轮询、静默重试、宽泛`catch`或额外标志掩盖错误所有权；
- 为通过测试增加平行真源、特殊分支、永久白名单或固定成功；
- 在成熟数据库、Migration、持久化模型和安全边界中进行无收益重写；
- 只验证当前修复路径，不验证旧功能、失败路径和相邻模块；
- 把局部重写扩大为无边界的全仓翻新。

设计和审查记录必须明确：保留的成熟内核、确认的根因、统一机制、迁移范围、回归范围、回滚边界，以及未采用逐点补丁或全量重写的理由。

## 9. 架构边界

```text
Electron Main
  生命周期、窗口、OS集成、凭据代理、Core监督

Preload
  命名白名单API、边界校验、MessagePort Bridge

Renderer
  React、Tiptap、Zustand和临时展示
  禁止Node、SQLite、文件系统、环境变量和凭据

Core Service Utility Process
  SQLite唯一写入者
  文件、FTS5、Provider、校验、导入导出、备份和恢复
```

- `contracts`只保存严格Schema、IPC类型、事件和错误码。
- `domain`保持纯实体和不变量。
- `core-service`承担Repository、Migration、写队列和业务用例。
- `editor-core`承担编辑器Schema、Patch、锁定和中文编辑算法。
- `prompts`集中保存版本化Prompt、约束、解析和清洗。
- `testkit`只用于测试，不得成为生产依赖。

## 10. 数据、IPC与AI规则

- `app.sqlite`只保存应用设置和元数据；每个项目只有一个权威`project.sqlite`。
- 所有写入通过Core单一串行写队列。
- 已发布Migration只追加。
- Draft Patch、Candidate采用、Version、StateProposal、结构操作、导入和Migration必须原子化。
- Version与VersionBlock没有业务更新路径；FTS、统计和缓存必须可重建。
- BrowserWindow必须保持`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`。
- 每个IPC和外部模型载荷必须使用严格Schema校验。
- Provider只转换协议，不查询项目数据、不持久化Candidate。
- 凭据保存在OS Credential Store；SQLite只保存`credentialRef`。
- Prompt使用稳定ID和整数版本，变更必须对应Eval。

## 11. UI与正式中文

- 正文始终是视觉中心；用户功能必须形成可操作闭环。
- 覆盖空、加载、成功、失败、取消、冲突、只读和恢复状态。
- 新手/专业模式和主题不得分叉业务逻辑。
- 未实现功能不得显示为可用。
- 正式中文名称以 `docs/product/AUTHOR_LANGUAGE_GLOSSARY.md` 为业务语言真源。
- 作者可见内容使用正式中文；内部标识只在代码、字段、命令或技术详情中出现。
- 完成后运行 `pnpm check:language`。

## 12. 验证与Evidence

基础命令：

```bash
pnpm check:language
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm test:e2e
pnpm build
pnpm release:check
```

按任务风险执行任务卡要求的专项检查。未经真实运行，不得声明通过。

新任务Evidence只强制：

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

Evidence必须绑定真实受检work Head；失败、跳过和环境限制必须如实记录。不得为满足模板生成无人查看的截图或Artifact。

## 13. 仓库写入与自动化边界

- 永久工作流可以校验、构建、测试、打包和输出诊断，禁止生成或改写正式业务代码、任务状态或产品文档。
- 单文件可使用Contents API；多文件修改应使用原子Git Tree/Commit，避免可见中间态。
- 禁止任务专属Workflow、一次性Runner、临时补丁目录和CI代写业务源码。
- 正式门禁在验证前后执行clean-tree检查。
- 写入前确认仓库、执行lane、基线SHA和允许路径；产品任务还必须确认任务ID与Runtime边界。写入后重新读取真实PR Head。

## 14. 提交与合并说明

人工提交标题、PR标题、描述、评论和回滚说明必须使用中文。代码标识符、文件路径、命令、协议名和库名可以保留英文。Controlled Merge使用PR标题生成Squash提交标题，因此PR标题必须准确、完整。

## 15. 网络与工具链回退

依赖或工具下载失败时，先检查版本、锁文件、Registry、代理、DNS、TLS、认证和缓存。确认当前环境无法联网后，使用永久`Toolchain Export`或`Engineering Validation`从GitHub Actions获取与锁文件一致的离线工具链和诊断。

不得通过更换主版本、改写锁文件、关闭严格校验、采用未知镜像或把Runner产物提交到普通分支来伪造推进。

## 16. 新任务基线复核

新任务启动前必须以最新已验证`main`为基线，核对已有功能、公共能力、数据结构、调用链、错误语义、恢复路径、测试和近期提交。发现任务卡与真实实现偏离时，先记录原假设、当前实现、偏离原因、影响范围和调整方案，再开始编码。

禁止只阅读任务卡和局部文件后直接实施、重复建设已有能力、形成并行真源或只验证新功能局部成功。
