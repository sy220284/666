# WorldForge M2 编辑安全与版本核心任务摘要

> 状态：Frozen  
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

所有正文修改统一受Patch、Revision、Hash、锁定、Candidate隔离和恢复保护。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M2-01 | [锁定块与Core LockGuard](M2/M2-01_LOCK_GUARD.md) | M1-05 | 建立UI与Core双层锁定保护，使所有正文修改路径无法破坏作者锁定内容。 |
| M2-02 | [Candidate与完整Version模型](M2/M2-02_CANDIDATE_VERSION_MODEL.md) | M1-07、M2-01 | 建立Draft、Candidate、Version三层正文模型，先以Fixture Candidate验证隔离和持久化。 |
| M2-03 | [Diff、冲突、采用与持久化撤销](M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md) | M2-02 | 完成Fixture Candidate与当前Draft之间的结构Diff、冲突处理、原子采用和重启后回退。 |
| M2-04 | [回收站、拆章、并章与结构恢复](M2/M2-04_TRASH_STRUCTURE_RECOVERY.md) | M2-03、M1-08 | 闭环卷、章和正文块的软删除、恢复、永久删除及高风险拆并章操作。 |

## 阶段退出门

- 正文写入统一经过Patch、Revision、Hash和LockGuard。
- Fixture Candidate可比较、冲突、采用、撤销和重启回退。
- 拆并章和永久删除有恢复点且失败不损坏原稿。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
