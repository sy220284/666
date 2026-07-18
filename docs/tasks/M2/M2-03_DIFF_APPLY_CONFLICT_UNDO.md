# M2-03 Diff、冲突、采用与持久化撤销

> 状态：In Progress  
> 里程碑：M2 编辑安全与版本核心  
> 优先级：P0  
> 工作分支：`work/m2-03-diff-apply-conflict-undo`

## 目标

建立一条可真实运行、可审计、可撤销的 Fixture Candidate 安全采用链路：

```text
Candidate
→ Diff预览
→ 选择与冲突检查
→ 单事务采用
→ ApplyRecord + Checkpoint
→ 即时撤销 / 重启后回退
```

M2-03交付的是候选采用引擎和最小桌面验收面，证明Candidate不会绕过Patch、Revision、Hash、LockGuard和恢复机制写入Draft。

## 当前实现进度（working tree）

- 阶段0：完成。合约循环与Core反向依赖已收敛，一次性输出/格式生成测试已删除或转换为行为测试，schema v8文档已同步。
- 阶段1：代码与非Electron自动化完成。结构/字符Diff、20,000字符分片取消、20,001+ Worker及完整桌面命令链已实现。
- 阶段2：代码与非Electron自动化完成。整稿/块/SceneBeat、非法选择拒绝、规范Patch审计日志、ConflictSet、LockGuard与三阶段事务回滚均通过。
- 阶段3：代码与非Electron自动化完成。即时Undo、重启读取ApplyRecord、Apply/Undo成功结果跨重启幂等重放、undo-stale与Checkpoint/快照完整性校验均通过。
- 阶段4：Format、Lint、Typecheck、Build、Unit、Integration、Migration、Security、Performance已通过；Electron E2E因当前Linux环境无`DISPLAY`/`xvfb-run`待CI执行。

任务保持`In Progress`，不得在Electron E2E、PR评审与main合并前改为Implemented或Verified。工作中证据见`docs/test-evidence/M2-03/`。

## 阶段定位

本任务关闭M2层的编辑安全闭环，并为M5-05完整候选审阅工作台提供稳定底层能力。

M2-03必须通过真实桌面链路完成预览、采用、冲突展示和撤销；但不承担最终候选工作台的完整视觉与交互形态。

## 非目标与M5-05边界

以下内容明确延期到`M5-05_CANDIDATE_REVIEW_APPLY.md`：

- AI任务完成后的候选入口与候选历史整合。
- 双栏、上下、单稿、只看差异等完整视图模式。
- 同步滚动、场景导航、差异快捷键和响应式布局完善。
- 多Candidate并排、骨架比较、融合与手动合并工作台。
- 1280×800、2K、21:9和完整无障碍视觉验收。

M2-03只实现最小功能审阅面：候选选择、当前稿/候选稿内容、结构与字符Diff摘要、选择结果、ConflictSet详情、采用和撤销入口。

## 依赖

- M2-01：LockGuard与锁定块保护。
- M2-02：Candidate、Version和来源模型。
- M1-05/M1-07/M1-08：Draft Patch、Version、Checkpoint和恢复底座。

## 关联

- 需求：REQ-013、REQ-029
- 功能ID：CND-002、CND-003、CND-004
- 验收：P0-029、P0-030、P0-031、P0-032

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 架构硬约束

1. `core-service`不得依赖`editor-core`或Renderer层。
2. 所有正文修改必须进入统一Draft Patch日志，禁止另建正文写入旁路。
3. Candidate在采用事务提交前保持隔离，未确认写入Draft次数必须为0。
4. Diff结果为动态派生数据，不把`diffType`保存为权威状态。
5. Apply、Conflict和Undo必须使用严格契约并经过Core、Main IPC和Preload白名单。
6. 冲突必须持久化为ConflictSet，不能用普通Toast替代。
7. 临时产物生成器、临时tsconfig路径映射和一次性测试不得进入最终PR。
8. 每个垂直切片必须先形成可运行调用链，再扩展下一切片。

## 重新规划后的执行顺序

### 阶段0：基线清理与架构收口

目的：先恢复一个可持续开发的干净基线，不在错误依赖和临时产物上继续叠加功能。

实施：

1. Candidate基础契约与Apply契约消除循环依赖。
2. Candidate Diff保留在Core内部纯模块，移除`core-service → editor-core`反向依赖。
3. 清理或转换所有格式、lockfile、契约输出生成器测试。
4. 恢复标准tsconfig、workspace依赖和格式状态。
5. 同步项目数据库schema v8迁移基线。

出口条件：

- `check:workspaces`、`check:boundaries`、Format、Lint、Typecheck、Build通过。
- Unit和现有Integration不因临时生成器失败。
- 分支中不存在一次性生成工具或临时依赖配置。

### 阶段1：Diff Preview垂直切片

目的：先让Fixture Candidate可以通过真实桌面链路被读取和预览，正文保持零写入。

实施：

1. 实现logicalBlockId结构Diff，覆盖新增、删除、移动、拆分、合并和修改。
2. 实现中文字符Diff及5000/20000字执行策略。
3. 将Preview命令接入：Contracts → Utility Core → Main IPC → Preload → Renderer。
4. 最小审阅面显示当前稿、候选稿、结构Diff、字符Diff和基础Revision。
5. partial Candidate显示明确限制。

出口条件：

- Fixture Candidate可在桌面应用中选择并显示Diff。
- 进入和退出预览不产生Draft写入。
- 5000字Diff首屏≤500ms、完整≤1.2s；20000字进入可取消渐进策略。
- P0-029取得自动化与桌面证据。

### 阶段2：Apply与Conflict垂直切片

目的：形成一次完整、原子、无静默覆盖的候选采用事务。

实施：

1. 支持整稿、完整块和SceneBeat选择映射；V1不支持逐字符拼接采用。
2. 提交前校验项目、Candidate状态、完整度、Draft ID、baseRevision、expectedHash和LockGuard。
3. 旧Revision、Hash变化、锁定、缺失块、结构冲突、partial整稿采用和重复采用进入ConflictSet。
4. 同一数据库事务内完成：
   - 采用前Checkpoint；
   - Draft Patch写入；
   - Revision + 1；
   - ApplyRecord；
   - Candidate状态更新。
5. 将Apply命令和ConflictSet接入完整桌面链路。
6. 最小审阅面显示选择摘要、冲突来源和应用结果。

出口条件：

- 无冲突采用只提交一次事务，失败时Draft、Candidate、Checkpoint和ApplyRecord全部回滚。
- 锁定块破坏率为0，旧Revision和Hash变化无静默覆盖。
- ConflictSet包含当前稿、候选、冲突类型和来源锚点。
- P0-030、P0-032取得自动化与桌面证据。

### 阶段3：Undo与重启恢复垂直切片

目的：保证采用结果可立即整体撤销，并在应用重启后仍可安全回退。

实施：

1. ApplyRecord保存正向与inverse操作及采用后快照校验信息。
2. 即时撤销复用Draft Patch，Revision再次递增，不覆盖历史Revision。
3. 重启后从ApplyRecord和Checkpoint生成回退预览。
4. 应用后Draft继续变化时生成`undo-stale`冲突，不静默恢复旧正文。
5. 将Preview Undo与Undo命令接入完整桌面链路。
6. 最小审阅面提供“撤销本次应用”和重启后回退入口。

出口条件：

- 即时撤销后正文逐块、顺序、属性、来源与锁定状态符合预期。
- 应用重启后仍可读取ApplyRecord并执行安全回退。
- 后续编辑导致回退过期时只生成ConflictSet，不修改正文。
- P0-031取得自动化与桌面证据。

### 阶段4：验收、证据和任务关闭

目的：只在完整链路和所有门禁真实通过后关闭任务。

实施：

1. 补齐Unit、Integration、Migration、Security、Performance和Electron E2E。
2. 覆盖故障注入：Checkpoint后失败、Draft持久化后失败、事务提交前失败。
3. 覆盖桌面全流程：创建Fixture Candidate → Preview → Apply/Conflict → Undo → 重启回退。
4. 证据保存到`docs/test-evidence/M2-03/`。
5. 同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`、数据库Schema、IPC契约和实际UI文档。
6. 六项永久检查全部通过后，PR才允许从Draft转为Ready。

出口条件：

- PR Policy、Task Governance、Quality、Security、Performance、Evidence全部成功。
- P0-029—P0-032均有明确证据链接。
- Candidate采用无静默覆盖、可审计、可撤销、可重启恢复。
- main合并后再将M2-03标记Implemented或Verified，不提前修改状态。

## 测试矩阵

| 切片 | 必测场景 | 主要测试层 |
|---|---|---|
| Preview | 新增/删除/移动/拆分/合并/修改、partial、5000/20000字、取消 | Unit、Performance、Electron E2E |
| Apply | 整稿/块/SceneBeat、旧Revision、Hash变化、锁定、缺失块、重复采用 | Unit、Integration、Security、E2E |
| Transaction | Checkpoint后失败、正文持久化后失败、提交前失败 | Integration、Migration |
| Undo | 即时撤销、重启读取、后续编辑导致undo-stale | Integration、Electron E2E |
| IPC | 非可信来源、未知命令、额外字段、非法ID和跨项目输入 | Security |

## 主要影响范围

默认只修改完成垂直链路所必需的路径：

- `migrations/project/`
- `packages/contracts/`
- `packages/core-service/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/unit/`
- `tests/integration/`
- `tests/migration/`
- `tests/security/`
- `tests/e2e/`
- `tests/performance/`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/test-evidence/M2-03/`

任何新增包依赖、编辑器核心修改或完整候选工作台扩展，必须先证明无法在上述范围内完成，并重新核对M5-05边界。
