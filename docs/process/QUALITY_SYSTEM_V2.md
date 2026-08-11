# WorldForge Quality System V2

> 状态：Active  
> 生效阶段：Phase 2B  
> 适用范围：产品代码、测试、数据库、桌面运行时、AI协议、UI体验、构建发布与仓库治理

## 1. 目标

WorldForge质量体系以风险覆盖、权威唯一、新鲜证据、产物身份和故障安全为核心。测试数量、Workflow数量和单一Coverage百分比只作为观测量，不构成质量结论。

五个长期不变量：

1. 每类实际风险必须有对应验证入口。
2. 每个关键状态、发布判断和持久化实体只能存在一个权威真源。
3. PASS必须绑定仍然适用于当前代码的验证事实。
4. 正式发布的Artifact必须可追溯到被验证的Source、Toolchain和平台构建。
5. 任何异常都不得静默损坏作者作品或让旧状态覆盖新状态。

## 2. Gate模型

```text
G0 Change Risk
→ G1 Architecture
→ G2 Static Quality
→ G3 Correctness
→ G4 Security
→ G5 Reliability / Performance
→ G6 Product Experience
→ G7 Artifact / Release
→ Controlled Merge
→ Main Verification
→ Release Qualification

G-META Meta-Governance持续验证整条治理链
```

服务器永久Required Context继续保持最小四项：

```text
pr-policy
quality / quality
security
performance
```

Reliability作为`quality / quality`内部Gate执行，不新增服务器Required Context。

## 3. G0：统一风险真源

机器权威：

```text
docs/process/CI_RISK_MATRIX.json
scripts/ci-risk-policy.mjs
```

任何Workflow不得再复制独立的文件路径风险表。当前统一路由至少覆盖：

- `fullSuite`
- `packageSmoke`
- `toolchainExport`
- `dependencyAudit`
- `applicationSecurity`
- `performance`
- `reliability`
- `uiAcceptance`
- `windowsIme`
- `governanceMeta`

Quality、Security、Performance和Reliability读取同一个Risk Plan。Windows真实中文输入法验收由变更风险触发，不依赖历史任务marker。

## 4. G1：Architecture

继续阻断：

- 循环依赖；
- 跨层反向依赖；
- Renderer访问Node、SQLite、文件系统、环境变量或凭据；
- Feature穿透另一Feature私有实现；
- 深层导入绕过公共入口；
- Contracts依赖业务实现；
- Production依赖Testkit；
- 同一权威实体存在多个写入入口；
- 为绕过边界复制业务逻辑或建立第二真源。

后续增加Architecture Diff、IPC/API Contract Diff和Authority Ownership报告。

## 5. G2：Static Quality

基础门包括：

- Prettier；
- ESLint；
- TypeScript strict；
- Workspace边界；
- CSS/SQL高置信静态检查；
- 代码质量策略；
- Toolchain策略；
- License一致性；
- Active文档一致性；
- Meta-Governance自检。

正式入口：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm check:boundaries
pnpm check:workspaces
pnpm ci:policy
```

## 6. G3：Correctness

当前保留：

- Unit；
- Integration；
- Migration；
- Coverage；
- Electron E2E。

Phase 2A增加确定性的连续序列不变量测试，用于覆盖单次示例测试难以发现的跨多轮状态错误。首批对象为Draft Revision/CAS和Recovery File Lease。

Phase 2B继续把Correctness提升到跨版本、跨生命周期与失败恢复：所有历史Project Schema必须能安全迁移到当前最新版并在二次打开时保持幂等；高频作品切换与保存/关闭交错必须保持作品身份和最新正文；事务或恢复流程中途失败后必须保留最后一个已提交权威状态，并允许安全重试。

Property-Based生成测试已经在Testkit建立确定性seed重放、独立run seed、Arbitrary生成与counterexample shrinking，并先接入Draft Revision/CAS真实SQLite状态机；高风险Mutation Test继续在Phase 2B评估，优先对象为Revision/CAS、Backup/Recovery、Migration、Lifecycle、Release和AI结构化协议。引入新依赖前必须同步锁文件和供应链验证，不手工伪造依赖状态。

## 7. G4：Security

当前权威继续覆盖：

- 全历史Secret Scan；
- Dependency Audit；
- Application Security；
- Electron边界；
- 路径/协议/Provider安全；
- Release信任。

Phase 4增加：

- SAST；
- SBOM；
- Dependency/License Inventory；
- Artifact Provenance。

## 8. G5：Reliability / Performance

机器入口：

```bash
pnpm test:reliability
```

`quality-core.yml`提供独立`reliability-tests` Job；PR由统一Risk Plan决定是否执行，正式Release使用默认`reliability_suite: true`，不得显式关闭。

仓库既有Testkit已经具备事务中断、真实SQLite Busy、可重复SQLite Full和SQLite Header Corruption等Fault Harness；Recovery、Migration、Draft CAS和File Lease也已有专项测试。Phase 2不复制这些基础设施，重点补系统级不变量和重复竞态。

Phase 2A已新增：

- Draft CAS连续Unicode写入序列：每轮成功提交Revision只增加1；旧Revision覆盖必须失败；reopen必须保持最新提交；Patch Log只记录真实成功提交。
- Daily Backup File Lease重复竞争：多路竞争始终只有当前owner；release后successor可接管；旧owner在token被替换后必须被fence，且不得删除successor锁。

Phase 2B当前新增：

- 全历史Project Migration Matrix：从每一个旧Schema版本迁移到当前latest，要求项目身份、名称、完整migration history和foreign key完整性保持；首次迁移必须生成恢复副本，二次reopen不得重复迁移或新增恢复副本。
- 高频作品切换：连续16轮排队执行`open A → close A → open B → close B`，验证lifecycle tail严格保持调用顺序、active project最终释放、两部作品正文不串写。
- 保存/关闭交错：连续12轮在Draft写入进入数据库队列后立即触发Project Close，要求写入成功、关闭成功、重新打开后正文和Revision等于最新已提交状态。
- Draft事务中断恢复：在Block、Revision、Patch Log和写作Session均已进入同一写事务后注入`after-patch-persist`故障，要求事务整体回滚；失败后正文、Revision、Patch Log和写作Session均保持故障前状态，同一requestId随后可安全重试且只提交一次。
- Restore瞬时故障重试：恢复副本完成数据库复制后注入一次故障，要求staging/target完整清理、源作品继续保持活动且正文不变；使用同一restore requestId与相同意图重试必须成功，并得到唯一可写恢复副本。
- Backup Cleanup部分失败重放：多目标清理在前序目标已提交删除、后续目标数据库删除瞬时失败时，必须把已完成目标持久化到cleanup journal，同时恢复未提交目标的SQLite文件、metadata和数据库记录一致性；使用同一cleanup requestId与planHash跨RecoveryService重试必须跳过已完成目标并继续剩余删除，最终不得残留`.deleting-*`文件。
- Backup创建补偿残留自修复：已验证SQLite与metadata进入终态后若数据库注册失败，且补偿删除也失败，必须保留可验证残片与真实失败记录；恢复文件系统条件后，同一backup requestId与相同意图跨RecoveryService重试必须复用终态文件、修复唯一`backup_records`记录、resolve原失败且不得生成`.partial-*`残片。
- Property-Based Draft CAS：Testkit使用确定性seed、独立run派生、可重放生成和greedy shrinking；Draft CAS生成Unicode、Emoji、CR/LF、Tab及结构字符序列，每个run与shrink candidate都使用独立真实SQLite项目，持续验证Revision单调递增、正文正规化、旧Revision拒绝、reopen一致性与Patch Log计数。

已有覆盖继续复用而不重复建设：

- Backup创建→Restore新副本→重新打开→继续写作的真实Roundtrip；
- Provider断流后的partial安全状态；
- 显式取消后Provider Abort与迟到delta隔离；
- Core受控重启、失联强制终止与旧进程事件隔离。

Phase 2B剩余重点：

```text
高风险Mutation Test
```

关键不变量：

- 权威正文不丢；
- SQLite不进入半事务状态；
- 旧generation不能覆盖新状态；
- 旧lease不能恢复所有权；
- 恢复点可用；
- 错误可解释并存在恢复路径。

性能继续以真实作者流程和P50/P95/P99趋势为主，覆盖大作品、启动、打开、切章、Autosave、搜索、备份、恢复和AI上下文组装。

## 9. G6：Product Experience

UI验收状态使用Schema 2。

每个`PASS`必须同时包含：

```text
verifiedCommit
scope[]
evidence[]
```

Release Gate会比较`verifiedCommit → 当前发布提交`。只要`scope`覆盖的文件在验收后发生变化，该PASS自动成为stale并阻断发布，直到重新完成真实验收并更新证据。

Windows真实中文输入法由Risk Plan触发。后续Phase 3增加Visual Regression和自动Accessibility扫描。

## 10. G7：Artifact / Release

ReleaseAcceptance继续是唯一产品发布权威。

Stable要求：

- 当前main拥有`main-verification=success`；
- Release Quality/Security/Performance/UI Acceptance全部通过；
- Reliability内部Gate通过；
- Linux/Windows/macOS原生构建与启动冒烟；
- Windows Authenticode；
- macOS Developer ID、Notarization、Stapling和Gatekeeper验证；
- Package Manifest和Hash二次验证。

Phase 4增加Artifact Lineage：

```text
sourceCommit
buildRun
toolchain
platform
architecture
packageHash
asarHash
SBOMHash
signatureIdentity
```

正式发布不得重新构建一份未经过验收的替代Artifact。

## 11. G-META：Meta-Governance

治理实现本身属于被测试产品。

机器入口：

```text
scripts/governance-self-check.mjs
```

当前至少验证：

- Quality最终聚合权威存在；
- Reliability风险路由与Quality输入存在；
- Security/Performance最终Context存在；
- Release仍强制UI Acceptance与Release Gate；
- Main Verification与双集成lane同步链存在；
- Risk Matrix结构完整；
- 高权限隐藏触发没有进入核心权威流程。

后续扩展GitHub状态机异常测试：旧Draft绿灯、rerun、cancel、stale status、CAS失败、Ref最终一致性、并发merge和权限变化。

## 12. License权威

根`LICENSE`与`package.json`必须统一为MIT：

```text
LICENSE = MIT License text
package.json license = MIT
```

机器入口：

```bash
pnpm check:license
```

许可证元数据漂移直接阻断`ci:policy`。

## 13. Active文档一致性

机器入口：

```bash
pnpm check:docs
```

当前检查活动权威文档至少保持：

- `main/work/governance`三分支模型；
- 四项永久Context；
- ReleaseAcceptance发布权威；
- Task Runtime退出产品Release判断；
- Active任务入口退役事实不被重新启用。

## 14. Phase计划

### Phase 1 — 已闭环

- MIT许可证权威统一；
- Unified Risk Matrix；
- Quality/Security/Performance统一风险入口；
- Windows IME风险触发；
- UI Acceptance freshness；
- Meta-Governance；
- Active文档一致性；
- 对应机器单测与CI策略接入。

### Phase 2A — 已闭环

- Reliability独立内部Gate；
- Reliability统一风险路由；
- Draft CAS连续序列不变量；
- File Lease重复竞争与fencing不变量；
- Release默认强制Reliability；
- Workflow与Meta-Governance永久策略。

### Phase 2B — 当前实施

已落地：

- 全历史Project Migration Matrix；
- 高频跨作品Lifecycle队列；
- Draft Save / Project Close交错不变量；
- Draft post-persist事务故障全回滚与同requestId安全重试；
- Restore瞬时故障清理与同意图安全重试；
- Backup Cleanup部分失败journal续跑、同requestId跨实例重放与三方状态收敛；
- Backup创建注册失败、补偿删除失败后的同requestId跨实例自修复与失败记录收敛；
- Property-Based确定性生成、seed重放、counterexample shrinking与Draft CAS真实SQLite属性验证；
- 复用现有Backup/Restore、Provider断流和Core Restart覆盖，避免重复测试。

继续推进：

- 高风险Mutation Test。

### Phase 3 — Experience

- Visual Regression；
- Accessibility自动扫描；
- 大作品性能；
- Memory Leak；
- 三平台体验矩阵。

### Phase 4 — Supply Chain

- SBOM；
- SAST；
- Artifact Provenance；
- License Inventory；
- Artifact Lineage；
- Release Reproducibility验证。

## 15. 完成定义

一项验证能力只有同时满足以下条件才视为落地：

```text
机器真源存在
+ 执行入口存在
+ 自动化真实调用
+ 失败会阻断对应Gate
+ 单测覆盖其判定逻辑
+ Active权威文档同步
```

只有文档、只有脚本或只有Workflow名称均不构成完成。