# M10-22 运行时所有权、恢复一致性与发布权威统一治理

> 状态：Implemented
> 里程碑：M10 稳定性与治理续作
> 优先级：P1
> 执行分支：`work`
> 目标分支：`main`
> 主线基线：`11cee20d7478be86909f42fffb37745225fba450`

## 目标

以一个治理任务完成Core故障接管、Recovery克隆与租约一致性、Renderer异步所有权、Provider严格契约和Release唯一权威收口，并同步修正M10-22推进过程中暴露的自动合并验证轮次与任务Verified状态断链。

本任务不恢复预授权、Task Governance PR阻塞或Evidence独立工程门禁。日常开发保持完全自动化：最小工程Context负责合并资格，任务真实性在合并后的Main Verification闭包。

## 根因与统一边界

本任务只统一工程原则，不创建跨领域万能生命周期框架：

- Core使用OS进程生命周期、强制终止和generation fencing。
- Recovery使用显式Clone Policy、tokenized file lease和真实写能力检查。
- Renderer使用request lane owner与pending单一状态所有权。
- Provider在IPC与持久化边界使用协议白名单Schema。
- Release只相信当前main、产品门禁、真实产物和发行信任证据。
- 服务器Ruleset与Controlled Merge共享同一个最终`quality / quality`权威；Controlled Merge另外验证最新Workflow Run新鲜度。
- Schema 2任务只由`task-verification/<TASK-ID>`把`IMPLEMENTED`提升为有效`VERIFIED`。

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
- 每日备份锁升级为owner token、heartbeat、lease expiry、stale reclaim互斥和提交前fencing。
- SQLite写事务对同项目同日期Daily Backup执行最终唯一winner仲裁，外部文件loser随后清理。
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

### F. Automated Verification Authority

- 永久工程Context保持`pr-policy / quality / quality / security / performance`四项，不重新增加Task Governance或Evidence阻塞。
- 服务器可见`quality / quality`必须是Quality顶层最终聚合门，同时依赖Core Quality、`quality / release-audit`与`quality / package-smoke`；Release Audit失败不得留下可用于原生合并的Quality绿灯。
- Controlled Merge继续读取当前Head最新Quality、Security、Performance Workflow Run，并交叉复核Quality内部三个权威Job；这层只负责验证轮次新鲜度，不能与服务器Ruleset形成第二套业务门禁。
- Ready Verified Evidence扫描必须显式传入当前PR `base.sha`，当前Schema 2 IMPLEMENTED Runtime在合并前排除历史`task-verification`解析，历史Implemented任务保持严格来源提交核验。
- Draft可用精确全量验证控制标记提前跑完整矩阵，但Draft结果永远不能成为Ready合并凭据。
- Ready即使不改变Head SHA，也必须以最新Quality/Security/Performance Workflow Run重新判定；旧Draft成功Context不得复用。
- Main Verification再次复核来源Head的最新Workflow Run。
- 带`worldforge-task` marker的任务PR在最终main读取Schema 2 Runtime，并发布`task-verification/<TASK-ID>`；该动作是合并后事实证明，不是开发授权。
- `TASK_INDEX.md`不得把Schema 2任务单方面提升为有效Verified；冻结Schema 1历史任务继续兼容静态Verified。

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

真实Windows Authenticode、macOS Developer ID/公证/stapling需要正式发行Secrets。缺少凭据时stable保持fail-closed；M10-22可以验证实现与失败关闭策略，但不得伪造真实证书验收结果。

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

#341中的Evidence曾绑定实现提交`f55bde319b5ba2b32db0b5d4513ea9a0a833a502`，该实现矩阵本身真实通过；但#341来源Ready Quality失败，合并后的`main-verification`和`task-verification/M10-22`均失败，因此该Evidence不能证明任务已经Verified。

#342修复最终Quality权威与Ready Evidence当前Runtime识别后，必须重新生成Evidence并绑定#342新的最终实现提交。`quality / release-audit`负责Ready Evidence校验；合并后的`task-verification/M10-22`负责最终任务Verified事实，两者不得混为一套门禁。

## 验证结果与恢复链

#341实现提交`f55bde319b5ba2b32db0b5d4513ea9a0a833a502`已真实通过完整工程矩阵：Quality Run `31325332376`、Security Run `31325332269`、Performance Run `31325332252`均成功，包含Unit、Integration、Migration、Coverage、Electron E2E和三平台package smoke。

随后#341 Ready最新Quality因Verified Evidence Scan把当前IMPLEMENTED Runtime错误解析为历史任务而失败；PR进入main后，Main Verification正确拒绝该来源并将`main-verification`与`task-verification/M10-22`发布为failure。因此M10-22有效状态保持`VERIFICATION_PENDING`，Work Synchronization与Branch Hygiene也没有完成。

#342以#341 squash main提交重新同步`work`后进行修复：

- `quality / quality`升级为顶层最终聚合Context，服务器Ruleset与Controlled Merge不再分裂。
- Verified Evidence Scan收到当前PR base SHA，当前Runtime不再走历史来源解析。
- workflow structure policy和单测锁定上述接线。
- `docs/process/DEVELOPMENT_AUTOMATION.md`与`docs/PROJECT_EXECUTION_ENTRY.md`同步同一权威语义。
- Draft静态Head `578b682580d7b1e6bcb70229598da9942811fa48`已通过PR Policy、Workspace、边界、Format、Lint、TypeScript以及新的顶层Quality聚合。
- 当前使用精确全量Draft标记触发#342完整矩阵；通过后再冻结新的implementationCommit并重写Evidence/Runtime来源绑定。

## 回滚

代码、工作流与文档可整体回退M10-22。新增Migration保持前向兼容，不回写历史Migration；Provider未知options被清理后不承诺恢复未被生产adapter消费的任意字段。已按新Clone Policy创建的恢复副本保持独立项目身份，不逆向恢复错误血缘。

## 完成条件

- [x] Core完全不响应时能够受控终止、确认exit并重新握手。
- [x] 旧Core generation不能影响新Core或提交迟到RPC结果。
- [x] Clone Policy覆盖全部Project Schema业务表，新增未分类表时CI失败。
- [x] 新恢复项目不继承旧备份记录、失败账本或外部派生血缘。
- [x] Daily backup lease与最终提交仲裁证明同一日期只有一个有效winner，包含并发stale reclaim竞态。
- [x] Recovery目录预检使用真实`W_OK`能力。
- [x] Dictionary mutation与reload竞态不再产生旧UI或提前解除pending。
- [x] Provider未知options不能写入SQLite，历史配置完成白名单归一化。
- [x] Release不再读取Task Runtime作为权威；unsigned stable被硬阻断，prerelease策略必须显式。
- [x] Controlled Merge与Main Verification只接受当前Head最新Workflow Run，旧Draft绿灯不能复用。
- [x] Schema 2任务只由真实task-verification提升为Verified。
- [x] Recovery并发stale reclaim与SQLite Daily winner仲裁已完成并进入完整回归。
- [x] 服务器`quality / quality`与Controlled Merge的Release Audit/package权威统一为同一最终Quality事实。
- [x] Ready Verified Evidence扫描能区分当前IMPLEMENTED Runtime与历史Implemented任务。
- [ ] #342完整Draft矩阵真实通过，Evidence重新绑定新的最终实现提交。
- [ ] Runtime `sourcePr`更新为#342并完成最终Ready Evidence收口。
- [ ] #342 Ready最新Quality/Security/Performance全部成功并由Controlled Merge自动合并。
- [ ] 合并后的main-verification、task-verification/M10-22、Work Synchronization和Branch Hygiene实际闭环。
