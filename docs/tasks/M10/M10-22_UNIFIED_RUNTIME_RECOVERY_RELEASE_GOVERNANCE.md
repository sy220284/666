# M10-22 运行时所有权、恢复一致性与发布权威统一治理

> 状态：In Progress
> 里程碑：M10 稳定性与治理续作
> 优先级：P1
> 执行分支：`work`
> 目标分支：`main`
> 主线基线：`11cee20d7478be86909f42fffb37745225fba450`

## 目标

以一个治理PR完成Core故障接管、Recovery克隆与租约一致性、Renderer异步所有权、Provider严格契约和Release唯一权威收口，消除全量审查确认的八个边界问题，并用自动门禁阻止同类问题随Schema、工作流或并发路径再次出现。

## 根因与统一边界

本任务只统一工程原则，不创建跨领域万能生命周期框架：

- Core使用OS进程生命周期、强制终止和generation fencing。
- Recovery使用显式Clone Policy、tokenized file lease和真实写能力检查。
- Renderer使用request lane owner与pending单一状态所有权。
- Provider在IPC与持久化边界使用协议白名单Schema。
- Release只相信当前main、产品门禁、真实产物和发行信任证据。

保留SQLite单写队列、正文原子写入、Revision/Hash、Candidate/Version、Provider CredentialBroker、SSRF防护和现有三平台便携包内核。

## 实施范围

### A. Core Runtime Resilience

- `UtilityProcessHandle`暴露受控终止能力。
- graceful drain/shutdown超时后终止旧Utility Process并确认exit。
- 旧进程message、exit和RPC结果按process generation隔离。
- restart、shutdown和应用退出并发调用保持single-flight。
- 旧RPC channel、listener和waiter在owner失效后完整清理。

### B. Recovery Consistency Hardening

- 为“恢复为新项目”建立穷举式Project Clone Policy。
- 所有Project Schema业务表必须显式分类；未知表阻断恢复和CI。
- `backup_records`、`backup_failures`与运行历史不进入新项目血缘。
- 派生索引与临时状态重建或清理；`backup_policies`保留并重映射。
- 每日备份锁升级为owner token、heartbeat、lease expiry和提交前fencing。
- Recovery写入目录使用`constants.W_OK`验证真实能力。

### C. Renderer Async Ownership

- Dictionary读取与mutation使用独立generation lane。
- pending由当前owner派生，reload不得清除或替代进行中的mutation。
- stale响应不得修改数据、消息或pending。
- deferred Promise竞态测试覆盖保存、删除、刷新和卸载。

### D. Provider Contract Hardening

- Provider配置改为协议判别联合与严格options白名单。
- 未知字段及credential-shaped替代字段全部拒绝。
- 既有`app.sqlite`配置通过追加Migration安全归一化。
- 历史custom记录保持可读取但不开放新的不可执行配置。

### E. Release Authority

- 当前main的`main-verification`是Source Authority。
- Quality、Security、Performance和UI Acceptance是产品门禁。
- 三平台hash、ASAR、Fuse和startup smoke是Artifact Integrity。
- stable必须具备Windows签名及macOS签名、公证、stapling真实验证证据。
- prerelease通过独立输入明确选择是否要求发行信任；draft维持作者自用候选语义。
- Task Runtime保留为历史与项目管理记录，不再参与Release资格判断。

## 数据库与Migration

- 不修改任何已发布Migration。
- 只追加App Migration，归一化Provider `options_json`；迁移前沿用现有app数据库备份。
- Project Clone Policy只作用于新恢复副本，不修改源项目或原地恢复语义。

## IPC、错误与UI

- 不扩大Preload或Renderer能力，不向Renderer暴露Node、进程或凭据。
- 不修改公开IPC method和`protocolVersion`。
- Core失败继续返回稳定错误和diagnosticId；强制恢复不得伪造成功。
- SearchPanel继续使用现有作者可见交互，只修正pending与数据一致性。

## 发布范围冲突处理

V1.0自用策略允许未签名draft；prerelease必须显式选择发行信任策略；stable属于正式第三方发行。最终工作流必须按发行类型验证实际信任能力，禁止仅相信manifest布尔值或允许unsigned stable发布。

## 自动化验证

```text
pnpm task:validate
pnpm check:language
pnpm check:workspaces
pnpm check:boundaries
pnpm format:check
pnpm lint
pnpm ci:policy
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm build
pnpm release:check
pnpm audit --audit-level=high
node scripts/verified-evidence-scan.mjs
pnpm test:e2e
```

## Evidence

保存到：`docs/test-evidence/M10-22/`

Evidence必须绑定最终受检work Head；历史Runtime、Migration和Evidence保持冻结。

## Draft PR验证进度与待办

当前已通过：

- `task:validate`、语言、Workspace、边界、格式、CI Policy、Lint与TypeScript。
- Unit 920项、Integration 199项、Migration 53项、Security 106项；Security另有1项按既有环境条件跳过。
- Core、Recovery lease/clone、Search owner、Provider allowlist与Release Authority专项回归。

Draft PR后续必须完成：

- [ ] 重新完成Coverage；首轮仅因Renderer TSX冻结未覆盖数增长失败，已新增SearchPanel/ProviderSettings真实React渲染回归，第二轮因交付Draft PR而主动停止。
- [ ] `pnpm test:perf`。
- [ ] `pnpm build`与`pnpm test:e2e`。
- [ ] `pnpm release:check`、`pnpm audit --audit-level=high`与Verified Evidence扫描。
- [ ] 在Windows/macOS原生Runner配置发行Secrets并验证真实签名、公证与stapling；缺少凭据时stable保持阻断。
- [ ] 生成并绑定M10-22最终Evidence，全部永久门禁成功后再转Ready。

## 回滚

代码、工作流与文档可整体回退M10-22。新增Migration保持前向兼容，不回写历史Migration；Provider未知options被清理后不承诺恢复未被生产adapter消费的任意字段。已按新Clone Policy创建的恢复副本保持独立项目身份，不逆向恢复错误血缘。

## 完成条件

- [x] Core完全不响应时能够受控终止、确认exit并重新握手。
- [x] 旧Core generation不能影响新Core或提交迟到RPC结果。
- [x] Clone Policy覆盖全部Project Schema业务表，新增未分类表时CI失败。
- [x] 新恢复项目不继承旧备份记录、失败账本或外部派生血缘。
- [x] 活跃每日备份不会因30秒mtime被抢锁，旧owner不能删除或提交新lease。
- [x] Recovery目录预检使用真实`W_OK`能力。
- [x] Dictionary mutation与reload竞态不再产生旧UI或提前解除pending。
- [x] Provider未知options不能写入SQLite，历史配置完成白名单归一化。
- [x] Release不再读取Task Runtime作为权威；unsigned stable被硬阻断，prerelease策略必须显式。
- [ ] 专项与完整验证矩阵真实通过，Evidence绑定最终实现提交。
- [ ] Controlled Merge、Main Verification和Work Synchronization完成。
