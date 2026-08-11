# WorldForge Quality System V2

> 状态：Active  
> 生效阶段：Phase 1  
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

内部专项验证由上述Context聚合，不新增大量服务器Required Context。

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
- `uiAcceptance`
- `windowsIme`
- `governanceMeta`

Quality、Security和Performance调用同一个Risk Plan。Windows真实中文输入法验收由变更风险触发，不依赖历史任务marker。

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

后续Phase增加Architecture Diff、IPC/API Contract Diff和Authority Ownership报告。

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

Phase 2优先建设：

- Property-Based Test；
- State Machine Test；
- 高风险模块Mutation Test。

优先对象：Revision/CAS、Backup/Recovery、Migration、Lifecycle、Release、AI结构化协议。

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

Phase 2新增专门的生命周期、并发和Fault Injection矩阵：

```text
旧请求后返回
新请求先返回
重复操作
快速切作品
关闭过程中保存
保存过程中崩溃
Core死亡/重启
heartbeat延迟
锁过期竞争
SQLite busy/corruption
ENOSPC
EACCES
Provider断流
半JSON
恢复中再次崩溃
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

UI验收状态已升级为Schema 2。

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

### Phase 1 — 当前实施

- MIT许可证权威统一；
- Unified Risk Matrix；
- Quality/Security/Performance统一风险入口；
- Windows IME风险触发；
- UI Acceptance freshness；
- Meta-Governance；
- Active文档一致性；
- 对应机器单测与CI策略接入。

### Phase 2 — Reliability

- Concurrency；
- Lifecycle；
- Fault Injection；
- Property-Based；
- Backup Roundtrip；
- Migration Matrix；
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
