# M3-05 伏笔生命周期与人物弧光

> 状态：Verified  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 建议分支：`work/m3-05-foreshadowing-character-arc`

## 目标

建立伏笔承诺追踪和人物弧光计划/里程碑模型。

## 阶段定位

建立规划、设定与连续性权威数据，作者确认后才改变状态。

## 非目标

- 不让AI直接命中弧光节点。
- 不把弧光做成心理学分类体系。
- 不提前实现M3-06的StateProposal接受、拒绝和尾快照流程。

## 依赖

M3-04

## 关联

- 需求：REQ-021、REQ-045
- 功能ID：FSH-001、ARC-001—ARC-004
- 验收：P0-040、P0-071、P0-072基础

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/decisions/ADR-006-character-arc-via-state-proposal.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/migration/`
- `tests/security/`
- `tests/e2e/`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/contracts/IPC_CONTRACTS.md`

## 实施内容

1. 实现伏笔`planned/planted/reinforced/partially_revealed/revealed/cancelled`生命周期。
2. 实现回收窗口、依赖、阻塞、互斥、增强和关联章节；依赖环、自依赖和互斥冲突必须由Core拒绝。
3. 实现CharacterArc标题、类型、状态和作者意图。
4. 实现ArcMilestone `planned/hit/skipped`、章节、依赖其他节点或TimelineEvent，并提供确定性排序。
5. 弧光节点状态只能由作者操作或后续StateProposal确认；M3-05不得提供AI直写权威状态的接口。
6. 提供Renderer、Preload、Main、Core完整调用链，以及列表式、可搜索的最小入口和超期/依赖提示。
7. 所有写命令使用严格Schema、可信Renderer来源校验、项目边界和单写队列。

## 测试与证据

- 伏笔合法/非法状态流转、回收窗口、关系循环、互斥、增强和软状态引用。
- 弧光节点依赖、章节移动、TimelineEvent来源、`planned/hit/skipped`合法转换。
- AI权限写入伏笔、人物弧光或弧光节点权威状态的成功次数必须为0。
- IPC畸形负载与不可信来源拒绝；Electron E2E真实写入并在UI展示。
- Migration、Integration、Security、Electron E2E、构建和clean-tree均通过。

证据保存到：`docs/test-evidence/M3-05/`

## 完成条件

- 伏笔和弧光均有权威数据模型，不依赖AI临时推断。
- 弧光状态推进接口为M3-06预留统一StateProposal路径，pending提案不会改变节点状态。
- 正式代码真实存在于最终PR Head，六类永久门禁验证同一Head。

## 质量加固与实现记录

- 恢复真实Prettier格式门禁，删除会打包源码并强制失败的错误脚本行为。
- Core新增“已激活伏笔之间后补互斥关系”拒绝，覆盖保存时和状态流转时的双路径冲突。
- 拆除Candidate Preview内部重复注册Continuity IPC的职责耦合，修复Electron在`ipc-register`阶段启动失败，并增加仅注册Candidate频道的回归测试。
- 补齐反向回收窗口、自关联、依赖环、互斥、`reinforces`、AI写入拒绝、节点章节移动、TimelineEvent跨项目、`skipped`与确认来源测试。
- 实现基线：`d0903e133a7d10165016aa0f587bff9908680dd1`。Quality运行`29732645227`、Security运行`29732645161`、Performance运行`29732645079`全部成功；真实Electron E2E、Migration、Integration、Build、Package Smoke与clean-tree均通过。
- M3批量复验运行`29914507812`完成最终验收关闭。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
