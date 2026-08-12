# WorldForge Quality System V2

> 状态：Active  
> 生效阶段：Phase 4  
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
- `platformExperience`
- `governanceMeta`

Quality、Security、Performance、Reliability和Platform Experience读取同一个Risk Plan。Windows真实中文输入法验收由变更风险触发，不依赖历史任务marker。

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

Property-Based生成测试已经在Testkit建立确定性seed重放、独立run seed、Arbitrary生成与counterexample shrinking，并先接入Draft Revision/CAS真实SQLite状态机。Targeted Mutation Test已经对Draft CAS、File Lease release fencing和Release main-verification fail-closed三个权威保护条件建立真实变异验证；baseline必须先绿，任何survivor都会阻断Reliability Gate，源码在每个mutant后必须原字节恢复。引入新依赖前仍必须同步锁文件和供应链验证，不手工伪造依赖状态。

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
pnpm test:mutation
```

`quality-core.yml`提供独立`reliability-tests` Job；PR由统一Risk Plan决定是否执行，正式Release使用默认`reliability_suite: true`，不得显式关闭。`test:reliability`在可靠性不变量通过后继续执行targeted Mutation Test，因此Mutation作为同一内部Gate的一部分，不新增服务器Required Context。

Mutation机器真源：

```text
docs/process/MUTATION_TEST_MATRIX.json
scripts/mutation-test.mjs
```

Mutation runner先在未变异源码上执行全部killer tests，baseline必须成功；随后单次只注入一个mutant，search必须在源码中恰好出现一次，对应killer test必须失败才视为killed。任何survivor、search漂移、进程异常或源码恢复失败都按fail-closed处理。每个mutant都在`finally`恢复源码，Reliability Job结束前再由clean-tree检查兜底。

仓库既有Testkit已经具备事务中断、真实SQLite Busy、可重复SQLite Full和SQLite Header Corruption等Fault Harness；Recovery、Migration、Draft CAS和File Lease也已有专项测试。Phase 2不复制这些基础设施，重点补系统级不变量和重复竞态。

Phase 2A已新增：

- Draft CAS连续Unicode写入序列：每轮成功提交Revision只增加1；旧Revision覆盖必须失败；reopen必须保持最新提交；Patch Log只记录真实成功提交。
- Daily Backup File Lease重复竞争：多路竞争始终只有当前owner；release后successor可接管；旧owner在token被替换后必须被fence，且不得删除successor锁。

Phase 2B已新增：

- 全历史Project Migration Matrix：从每一个旧Schema版本迁移到当前latest，要求项目身份、名称、完整migration history和foreign key完整性保持；首次迁移必须生成恢复副本，二次reopen不得重复迁移或新增恢复副本。
- 高频作品切换：连续16轮排队执行`open A → close A → open B → close B`，验证lifecycle tail严格保持调用顺序、active project最终释放、两部作品正文不串写。
- 保存/关闭交错：连续12轮在Draft写入进入数据库队列后立即触发Project Close，要求写入成功、关闭成功、重新打开后正文和Revision等于最新已提交状态。
- Draft事务中断恢复：在Block、Revision、Patch Log和写作Session均已进入同一写事务后注入`after-patch-persist`故障，要求事务整体回滚；失败后正文、Revision、Patch Log和写作Session均保持故障前状态，同一requestId随后可安全重试且只提交一次。
- Restore瞬时故障重试：恢复副本完成数据库复制后注入一次故障，要求staging/target完整清理、源作品继续保持活动且正文不变；使用同一restore requestId与相同意图重试必须成功，并得到唯一可写恢复副本。
- Backup Cleanup部分失败重放：多目标清理在前序目标已提交删除、后续目标数据库删除瞬时失败时，必须把已完成目标持久化到cleanup journal，同时恢复未提交目标的SQLite文件、metadata和数据库记录一致性；使用同一cleanup requestId与planHash跨RecoveryService重试必须跳过已完成目标并继续剩余删除，最终不得残留`.deleting-*`文件。
- Backup创建补偿残留自修复：已验证SQLite与metadata进入终态后若数据库注册失败，且补偿删除也失败，必须保留可验证残片与真实失败记录；恢复文件系统条件后，同一backup requestId与相同意图跨RecoveryService重试必须复用终态文件、修复唯一`backup_records`记录、resolve原失败且不得生成`.partial-*`残片。
- Property-Based Draft CAS：Testkit使用确定性seed、独立run派生、可重放生成和greedy shrinking；Draft CAS生成Unicode、Emoji、CR/LF、Tab及结构字符序列，每个run与shrink candidate都使用独立真实SQLite项目，持续验证Revision单调递增、正文正规化、旧Revision拒绝、reopen一致性与Patch Log计数。
- Targeted Mutation Test：首批三个mutant分别禁用Draft stale-revision guard、File Lease release前第二次successor token确认、Release main-verification强制条件；三个mutant均已被对应killer test真实杀死。File Lease还新增确定性TOCTOU竞态测试，在第一次release inspect后立即安装successor token，确保第二次确认缺失时测试必然失败。

已有覆盖继续复用而不重复建设：

- Backup创建→Restore新副本→重新打开→继续写作的真实Roundtrip；
- Provider断流后的partial安全状态；
- 显式取消后Provider Abort与迟到delta隔离；
- Core受控重启、失联强制终止与旧进程事件隔离。

关键不变量：

- 权威正文不丢；
- SQLite不进入半事务状态；
- 旧generation不能覆盖新状态；
- 旧lease不能恢复所有权；
- 恢复点可用；
- 错误可解释并存在恢复路径。

性能继续以真实作者流程和P50/P95/P99趋势为主，覆盖大作品、启动、打开、切章、Autosave、搜索、备份、恢复和AI上下文组装。

Phase 3真实大作品核心交互性能门已接入现有独立Performance权威，机器入口与Evidence为：

```text
tests/performance/phase3-large-project-performance.test.ts
test-results/performance/phase3-large-project.json
```

真实Fixture固定为10卷、500章、每章约3000中文字符（正文合计不少于150万字符）、150实体及当前Canon Fact、200伏笔、50人物弧光和100 Manual Versions。Fixture构造时间不计入指标，测试直接复用Frozen与既有机器预算，不建立第二套阈值。Ready CI run `31545126270` / Artifact `9122181787` 已验证：project reopen 37.57ms / 3000ms；跨章Draft open P95 0.53ms / 800ms；Autosave P95 1.93ms / 150ms；FTS rebuild 472.58ms / 10000ms；FTS query P95 4.44ms / 200ms；Constraint Package P95 5.03ms / 1000ms，六项全部通过并由`performance`永久Context阻断。

Phase 3 Memory Leak稳定态机器门已接入现有独立Performance权威。机器真源与Evidence为：

```text
docs/process/MEMORY_LEAK_BUDGET.json
scripts/memory-leak-policy.mjs
scripts/memory-leak-probe.mjs
tests/performance/memory-leak-probe.test.ts
tests/unit/memory-leak-policy.test.ts
test-results/performance/phase3-memory-leak.json
```

探针使用Node `--expose-gc`，每阶段连续3次显式GC；先将有界幂等缓存预热越过1000-entry保留上限，再开始稳定态测量，从而区分正常缓存填充与不可回收增长。Draft场景执行1200次warmup后继续5×250次真实`DraftService.applyPatch`；Project lifecycle执行600次warmup后继续5×100次真实open/close。阻断指标同时覆盖final growth、peak growth、tail spread和positive slope bytes/operation。基于真实CI post-GC样本校准后，预算已切换为`enforced`：Draft三项增长上限均为1 MiB、positive slope上限512 B/op；Project lifecycle三项增长上限均为2 MiB、positive slope上限4096 B/op。Ready Performance run `31555098695`与Main Verification `31555996135`均已通过，失败继续由永久`performance` Context fail-closed阻断。

Phase 3大作品Backup/Restore性能门已接入现有独立Performance权威，机器真源与Evidence为：

```text
docs/process/LARGE_PROJECT_BACKUP_RESTORE_BUDGET.json
scripts/large-project-backup-restore-policy.mjs
tests/unit/large-project-backup-restore-policy.test.ts
tests/performance/phase3-large-project-backup-restore.test.ts
test-results/performance/phase3-large-project-backup-restore.json
```

测试复用10卷、500章、正文不少于150万字符、150实体、200伏笔、50人物弧光与100 Manual Versions的真实大作品Fixture，直接调用正式`RecoveryService`完成5轮命名快照与恢复新副本，并重新打开最后一份恢复副本核对卷、章、实体、伏笔、人物弧与版本数量。首轮真实GitHub Actions样本校准后预算已切换为`enforced`：Backup P95 ≤ 200 ms，Restore P95 ≤ 300 ms；任何预算超限继续由永久`performance` Context fail-closed阻断。

## 9. G6：Product Experience

UI验收状态使用Schema 2。

每个`PASS`必须同时包含：

```text
verifiedCommit
scope[]
evidence[]
```

Release Gate会比较`verifiedCommit → 当前发布提交`。只要`scope`覆盖的文件在验收后发生变化，该PASS自动成为stale并阻断发布，直到重新完成真实验收并更新证据。

Windows真实中文输入法由Risk Plan触发。

Phase 3首批Visual Regression已落地：Linux CI固定1280×800，复用M8-07中文作者体验场景，对Theme A/B × Light/Dark四个稳定状态执行严格截图SHA-256与尺寸验证。Baseline机器真源与执行入口为：

```text
tests/e2e/visual-baselines/manifest.json
tests/e2e/visual-regression.spec.ts
```

Baseline manifest同时绑定两次独立、完整全绿Electron E2E Artifact作为source与stability witness，二者不得复用同一commit、run或artifact。截图hash或尺寸漂移会直接阻断现有Electron E2E；失败时actual PNG进入现有`desktop-e2e-evidence` Artifact供差异审查。Baseline判定逻辑由独立Unit覆盖。

Phase 3首批Accessibility自动验证已落地，机器真源与真实执行入口为：

```text
tests/e2e/accessibility-audit.ts
tests/e2e/accessibility.spec.ts
tests/unit/accessibility-audit.test.ts
```

扫描复用现有Playwright/Electron，无新增第三方无障碍依赖；真实覆盖首页、新建作品Modal与写作工作台。当前高置信规则要求可见交互控件和Dialog具有计算Accessible Name，禁止正`tabindex`、重复DOM id、缺失`img alt`以及`aria-hidden=true`区域包含仍可聚焦元素。Modal场景同时验证`role=dialog`、`aria-modal=true`、打开后焦点进入、连续Tab不逃逸、Escape关闭与焦点回到触发按钮。判定逻辑由Unit覆盖，真实Electron E2E失败直接阻断现有Quality Gate，不建立waiver baseline。

Phase 3三平台作者体验矩阵已落地，机器真源与真实执行入口为：

```text
docs/process/PLATFORM_EXPERIENCE_MATRIX.json
tests/e2e/platform-experience.spec.ts
test-results/platform-experience/{linux,windows,macos}.json
```

统一Risk Plan在Renderer/Main/Preload/Contracts/E2E等体验风险变化时触发该矩阵；`quality.yml`分别在`ubuntu-24.04`、`windows-latest`和`macos-latest`原生Runner执行同一真实Electron作者主路径，覆盖Renderer Ready、快速创建作品、中文/Unicode正文写入与保存、1280×800无横向溢出、主题往返和正常关闭。Ready Quality run `31574512538`中macOS Artifact `9132633842`、Windows Artifact `9132648030`、Linux Artifact `9132652468`全部成功并绑定最终Head `41f07d7d98f9b4ae69475fb71a9b6a3f01eb9211`；任一平台失败都会阻断`quality / quality`。Linux严格像素Visual Regression、Windows真实Microsoft Pinyin与三平台Package Smoke继续保持独立权威，互不替代。#376合入main后，commit `7a473a7cd3f8c5ef88775b7f5398bff457cb2e1e`已取得`main-verification=success`。

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
- 三平台体验矩阵与风险路由权威存在；
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

### Phase 2B — 已闭环

- 全历史Project Migration Matrix；
- 高频跨作品Lifecycle队列；
- Draft Save / Project Close交错不变量；
- Draft post-persist事务故障全回滚与同requestId安全重试；
- Restore瞬时故障清理与同意图安全重试；
- Backup Cleanup部分失败journal续跑、同requestId跨实例重放与三方状态收敛；
- Backup创建注册失败、补偿删除失败后的同requestId跨实例自修复与失败记录收敛；
- Property-Based确定性生成、seed重放、counterexample shrinking与Draft CAS真实SQLite属性验证；
- Targeted Mutation Test机器真源、baseline防伪、survivor阻断、源码恢复检查与三项高风险mutant真实kill；
- File Lease release TOCTOU确定性竞态验证；
- 复用现有Backup/Restore、Provider断流和Core Restart覆盖，避免重复测试。

### Phase 3 — 已闭环

- Linux 1280×800 Visual Regression：M8-07四主题稳定基线、双独立全绿Artifact provenance、严格SHA-256/尺寸阻断、actual PNG诊断与Unit判定覆盖。
- Accessibility自动验证：首页/新建作品Modal/写作工作台高置信扫描、Accessible Name与DOM语义规则、Modal焦点圈/Tab/Escape回焦、Unit判定覆盖与真实Electron E2E阻断。
- 真实大作品核心交互性能门：10卷/500章/≥150万字符/150实体/200伏笔/50人物弧/100版本真实SQLite Fixture，覆盖reopen、跨章open、Autosave、FTS rebuild/query与AI Constraint Package，并复用现有Performance永久Context阻断。
- Memory Leak稳定态机器门：先跨越1000-entry有界缓存保留上限再取样，显式GC并覆盖Draft与Project lifecycle稳定态，final/peak/tail growth及positive slope全部由真实CI校准后的`enforced`预算阻断。
- 大作品Backup/Restore性能门：5轮真实命名快照与恢复，Backup P95 ≤ 200 ms、Restore P95 ≤ 300 ms的`enforced`预算由永久`performance` Context阻断。
- Windows/macOS/Linux三平台作者体验矩阵：同一真实Electron作者主路径在三平台原生Runner执行并生成独立Evidence，任一平台失败阻断`quality / quality`。

### Phase 4 — 当前实施（Supply Chain）

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