# M3-02 SceneBeat、场景关联与跨章移动

> 状态：In Progress  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 建议分支：`feat/m3-scene-beat-cross-chapter`

## 目标

建立SceneBeat规划模型、正文关联和安全跨章移动。

## 阶段定位

建立规划、设定与连续性权威数据，作者确认后才改变状态。

## 非目标

- 不实现AI T0。
- 不自动从正文强制生成SceneBeat。

## 依赖

M3-01、M2-04

## 关联

- 需求：REQ-014、REQ-015、REQ-016
- 功能ID：PLN-004、PLN-006
- 验收：P0-034、P0-035

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `tests/integration/`
- `tests/e2e/`
- `tests/migration/`
- `tests/security/`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/ui/EDITOR_INTERACTION_SPEC.md`

## 实施内容

1. 实现SceneBeat目标、冲突、预期结果、类型、字数比例、必选标记和排序。
2. 建立SceneBeat与人物、地点、PlotNode和正文块的可选关联。
3. 删除SceneBeat不删除正文。
4. 正文片段可由作者选择关联或转换为SceneBeat。
5. 跨章移动先预览影响，SceneBeat移动与DraftBlock移动分开确认。
6. 涉及正文时使用恢复点、Patch、Revision、Hash和LockGuard。

## 实现约束落地

- SceneBeat是规划权威数据；删除仅解除规划关联并软删除节拍，不删除DraftBlock。
- SceneBeat跨章移动必须先生成含关联正文影响的planHash预览；规划移动和正文移动分别确认。
- 关联正文的实际跨章移动复用M2-04恢复点、Patch、Revision、Hash与LockGuard链路；移动后按logicalBlockId重建关联。
- 人物与地点关联先保存UUID引用，M3-03建立实体表后再增加存在性校验与选择器，避免倒置依赖。
- SceneBeat命令全部使用`planning.sceneBeat.*`全限定操作名，禁止覆盖项目结构或大纲树命令键。
- 实现分支已同步main提交`84112ba1`；任务范围只包含M3-02业务、测试、文档与证据文件。

## 测试与证据

- 场景排序、删除恢复、正文关联和规划变化正文不变。
- 跨章移动有关联正文、锁定、冲突、取消和事务中断。
- 移动后引用和字数统计一致。

证据保存到：`docs/test-evidence/M3-02/`

## 完成条件

- SceneBeat成为作者规划与后续T0共用结构。
- 不存在M2使用尚未创建SceneBeat的倒置依赖。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
