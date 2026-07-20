# M3-02 SceneBeat、场景关联与跨章移动

> 状态：In Progress  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 工作分支：`work/m3-02-scene-beat-cross-chapter`

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
- `docs/database/SCENE_BEAT_ENTITY_REFERENCES.md`
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
- `docs/database/SCENE_BEAT_ENTITY_REFERENCES.md`
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
- M3-03建立实体表后，`scene_beat_entities`成为人物、地点关联的权威关系表；`character_ids_json`与`location_ids_json`仅为受数据库约束的旧合同兼容投影，不得形成第二真源。
- 新增人物、地点引用必须验证Entity存在、同Project、类型匹配且状态为active；无效、跨项目、错误类型和新增归档引用均原子拒绝。
- Entity归档后，既有SceneBeat引用继续保留并参与永久删除影响预览；无关SceneBeat编辑不得静默丢失历史引用。
- Renderer通过当前项目实体选择器维护人物和地点，不再向作者暴露UUID手填入口；已有归档引用显示“已归档”并允许显式移除。
- SceneBeat命令全部使用`planning.sceneBeat.*`全限定操作名，禁止覆盖项目结构或大纲树命令键。

## 测试与证据

- 场景排序、删除恢复、正文关联和规划变化正文不变。
- 跨章移动有关联正文、锁定、冲突、取消和事务中断。
- 移动后引用和字数统计一致。
- 人物、地点引用覆盖合法、缺失、跨项目、类型错误、新增归档拒绝和既有归档保留。
- 兼容JSON与`scene_beat_entities`关系集合双向同步且不可漂移。
- 删除影响预览统计旧入口写入的引用。
- Electron E2E验证实体名称选择器、隐藏UUID输入、关联持久化和正文不变。

证据保存到：`docs/test-evidence/M3-02/`

## 完成条件

- SceneBeat成为作者规划与后续T0共用结构。
- 人物、地点关联只有一个受数据库约束的权威关系集合。
- 不存在M2使用尚未创建SceneBeat的倒置依赖。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
