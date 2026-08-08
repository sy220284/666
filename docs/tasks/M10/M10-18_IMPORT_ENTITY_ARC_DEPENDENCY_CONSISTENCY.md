# M10-18 导入幂等、实体删除与弧光依赖一致性收口

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作 / V1.5 跨域语义与运行一致性收口  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`8671dcdfe2e7220915de1d8787f8244a26f406a0`  
> 最终产品实现提交：`1c4d522c71061a8ee5caa235d7f314b50033cb9c`

## 目标

收口三个已经存在数据结构或事务基础、但运行语义仍不完整的边界：Import Commit 的端到端幂等、Entity Permanent Delete 的事务内依赖裁决、Arc Milestone 对 Timeline Event 依赖的真实阻断语义。

## 阶段定位

承接已有效 VERIFIED 的 M10-17，继续补齐 `Lifecycle → Destructive Mutation → Cross-domain Dependency` 链路。M10-18 完成 Controlled Merge、主线验证和 Work Synchronization 后，才能启动后续任务。

## 非目标

- 不修改已发布 Migration、数据库 Schema、IPC Channel、协议版本或正式错误码。
- 不重写 Import/Export、Recovery、Entity Canon、Timeline、Narrative Planning 成熟状态机。
- 不新增第二套幂等缓存、Entity 引用索引或 Arc 依赖存储。
- 不改变 Timeline Event 数据模型，不新增“已发生”持久状态。
- 不提前实施后续任务。
- 不降低 Coverage、安全、性能、Build 或 Electron E2E 门禁。

## 依赖与真实承接基线

- M10-17 来源 PR #326 已 Controlled Merge。
- `main-verification=success`、`task-verification/M10-17=success`。
- 启动时 `main == work == 8671dcdfe2e7220915de1d8787f8244a26f406a0`，ahead/behind 为 0/0。
- 启动时不存在开放的 `work → main` PR。

## 关联

- Import Commit：外层 source/plan/checkpoint/随机 ID 生命周期未纳入同一 requestId 幂等边界；DB write 虽有命令身份保护，但重复调用仍可产生额外 Recovery checkpoint，且成功后 plan 删除会让同一请求无法稳定重放。
- Entity Permanent Delete：Preview 与 DELETE 分属两个事务窗口，存在 TOCTOU；Preview 只覆盖 SceneBeat，未覆盖 Timeline location、Timeline participant/subject/witness、Character Arc 等 `ON DELETE RESTRICT` 依赖。
- Arc Timeline Dependency：`arc_milestone_timeline_dependencies` 已持久化，保存时也校验目标存在，但 Catalog attention 与 milestone `hit` transition 没有消费该依赖，导致依赖只是展示数据。

## 必读文档

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DATA_FLOW.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/process/WORKFLOW_EXECUTION_ORDER.md`
- `docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md`
- `docs/tasks/M1/M1-09_TEXT_IMPORT_EXPORT_MVP.md`
- `docs/tasks/M3/M3-03_ENTITY_CANON.md`
- `docs/tasks/M3/M3-04_STATE_TIMELINE_KNOWLEDGE.md`
- `docs/tasks/M3/M3-05_FORESHADOWING_CHARACTER_ARC.md`

## 主要影响范围

- `packages/core-service/src/import-export/import-commit-service.ts`
- `packages/core-service/src/entity-canon.ts`
- `packages/core-service/src/narrative-planning/character-arc-operations.ts`
- `packages/core-service/src/narrative-planning/narrative-planning-catalog.ts`
- `tests/integration/m10-18-import-entity-arc-consistency.test.ts`
- 当前任务 Runtime、TASK_INDEX 与 Evidence。

## 职责、状态所有权与依赖方向

1. Import Plan Store 继续持有 Preview 后的短期计划；ImportCommitService 负责完整 commit 生命周期幂等，Database write 继续负责事务内单写与命令身份冲突。
2. 同一 Import `requestId + command identity` 必须共享同一 Promise/结果；相同 requestId 携带不同 commit payload 必须稳定冲突。失败 Promise 不永久占用 requestId，允许修复条件后重试。
3. Recovery checkpoint、source hash 复核、随机 ID 分配、DB transaction 与最终 result 必须位于同一个高层幂等操作中；成功重放不得新增 checkpoint 或生成不存在的 ID。
4. Entity 永久删除的最终裁决必须发生在同一个 `BEGIN IMMEDIATE` write transaction 内；Preview 仅供 UI 提前展示，不能作为删除时的权威裁决结果。
5. Entity Delete 依赖检查以现有 FK/业务引用为真源：SceneBeat、Timeline location、Timeline entity link、Character Arc 等独立领域引用存在时阻断；Canon Fact、Entity State、Knowledge State 等 Entity 自有从属数据继续按现有 CASCADE 语义随实体删除。
6. Arc Milestone 的 milestone→milestone 与 milestone→timeline 两类依赖都属于命中前置条件。Timeline dependency 必须有当前有效事件、具备章节锚点，且事件章节位置不得晚于 milestone 实际命中章节。
7. Catalog attention 与 transition 必须复用同一 Timeline dependency 判定语义，避免 UI 显示可执行而 Core 拒绝，或 UI 未提示但 Core 静默接受。

## 数据库与 Migration

- 已发布 Migration 冻结；本任务不新增 Migration/Schema。
- 继续使用 `scene_beat_entities`、`timeline_events`、`timeline_event_entities`、`character_arcs`、`arc_milestone_timeline_dependencies` 现有索引与 FK。
- Entity DELETE 不手工级联独立领域引用，不通过关闭 foreign_keys 或先删引用绕过保护。
- Import 仍使用单个 Project SQLite transaction 创建 Volume/Chapter/Draft/Version/PatchLog。

## IPC、事件与错误码

- 不新增 IPC Channel，不修改协议版本。
- Import requestId 冲突映射为现有 `IMPORT_COMMIT_FAILED` 稳定失败，不引入新的公共错误码。
- Entity 依赖存在继续使用 `ENTITY_REFERENCED`。
- Arc Timeline dependency 未满足继续使用 `NARRATIVE_CONFLICT`；目标不存在使用既有 `NARRATIVE_NOT_FOUND`。

## UI闭环

- 不新增 UI 状态机。
- Entity Preview 的现有 `blockers` 继续承载阻断原因，因此无需扩张公共 Contract。
- Narrative Planning Catalog 的 `attention/warnings` 已纳入 Timeline dependency，现有 Renderer 自动消费。

## 安全、隐私与恢复

- 所有数据继续仅保存在本地。
- Import 每个真实新 commit 仍必须先建立 Recovery checkpoint；同请求重放不得产生第二份 checkpoint。
- Entity delete 发生任何依赖竞态时必须整体不删除，项目继续可用。
- 不扩大 Renderer、Preload、文件系统或数据库能力面。

## 性能预算

- Import 幂等只增加 O(1) 有界 request cache 查找。
- Entity delete 依赖检查使用现有按 entity/project 建立的索引；单次删除只执行固定数量 COUNT/EXISTS 查询。
- Arc Timeline dependency 在单 milestone transition 内按当前 milestone 做有界查询；Catalog 不增加全项目无界扫描。

## 实施结果

1. ImportCommitService 已复用现有 `BoundedIdempotentPromiseCache` 建立完整 commit 生命周期幂等；Plan/source 校验、Recovery checkpoint、随机 ID、SQLite transaction 与最终结果共享同一个 request Promise。事务 callback 直接返回真实 `ImportCommitResult`，成功重放不再依赖已删除的 Plan，也不生成第二份 checkpoint/ID。
2. 相同 Import requestId 使用不同 payload 时稳定映射为既有 `IMPORT_COMMIT_FAILED`；失败 Promise 继续由现有有界缓存移除，可在外部条件修复后重试。
3. Entity Delete Preview/Dependency 判定已抽取为可复用事务内读取；Preview 继续用于 UI 提示，Delete 在 `writeProject` 内重新计算权威 blockers 后才确认并删除，关闭 Preview→Delete TOCTOU。
4. Entity blocker 已覆盖 SceneBeat、Timeline location、Timeline participant/subject/witness 共用的 entity link、Character Arc；Canon Fact 等既有 CASCADE 从属数据不被误判为独立引用。
5. Arc Timeline dependency 已建立统一判定：保存时拒绝不存在或 archived Event；Catalog 在有 reference chapter 时将未锚定/晚于当前章的依赖标记 blocked；`hit` transition 使用实际命中章节复用同一判定并返回 `NARRATIVE_CONFLICT`。
6. 新增 `m10-18-import-entity-arc-consistency.test.ts`，锁定并发/已完成 Import replay、requestId payload 冲突、Entity 跨域依赖与 Preview 后新增引用竞态、CASCADE 从属数据，以及 Timeline dependency 章节先后/未锚定语义。
7. 产品实现候选 `1c4d522c71061a8ee5caa235d7f314b50033cb9c` 的 Draft Static 已通过 Task Validation、Workspace、Boundary、Format、Lint、Typecheck；完整 Unit/Integration/Migration/Coverage/Build/Electron E2E 仍由 Ready 永久矩阵裁决。

## 自动化测试

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
pnpm test:e2e
```

## 人工验收

- 同一 Import Commit 命令重复提交，返回完全相同 ID/checkpoint/result，项目只增加一套导入数据。
- 同 requestId 换不同 Import payload，被稳定拒绝且不写入。
- Entity 在 Preview 后新增 Timeline/Arc 引用，再执行 Delete，事务内重新裁决并阻断。
- Arc milestone 依赖未锚定或位于实际命中章节之后的 Timeline Event 时不能 hit；依赖事件位于同章或更早章节时可 hit。

## Evidence

保存到：`docs/test-evidence/M10-18/`。

## 回滚策略

整体回退 M10-18 产品实现与专项测试；不回滚任何 Migration、M10-17 或历史 Evidence。禁止只移除测试而保留新的依赖语义或幂等缓存。

## 完成条件

- [x] Import Commit 完整生命周期幂等闭环。
- [x] Entity Permanent Delete 事务内依赖裁决闭环。
- [x] Arc Timeline Dependency 具备 attention 与 transition 真实运行语义。
- [ ] Unit / Integration / Migration / Coverage / Security / Performance / Build / Electron E2E 全绿。
- [ ] Ready Evidence 绑定最终 implementation commit。
- [ ] Controlled Merge 完成。
- [ ] `main-verification` 与 `task-verification/M10-18` 成功。
- [ ] `work` 受控同步到已验证 `main`。
