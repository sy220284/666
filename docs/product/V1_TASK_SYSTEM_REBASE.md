# WorldForge V1.0任务体系重排基线

> 状态：Active  
> 初始重排日期：2026-07-14  
> 整体收口日期：2026-07-25  
> 适用：任务编号、独立执行边界、需求吸收关系、内部实施顺序和阶段门。

## 1. 当前执行基线

V1历史任务规格仍保留M0—M8编号和54份任务文件，用于需求、设计、测试和历史追踪。

独立执行体系现收口为34张任务：

```text
M0-01—M0-07
M1-01—M1-09
M2-01—M2-04
M3-01—M3-10
M4-01—M4-04
```

其中M0—M3与M4-01—M4-03已经Verified；M4-04为V1剩余功能唯一整体任务。

原M4-05—M8-03共20份任务卡保留为详细需求来源，状态为`Removed（absorbed by M4-04）`，不得独立激活、建立正式功能分支/PR、切换状态或单独关闭。Removed只取消执行形式，不取消需求、非目标、合同、测试与完成条件。

权威入口：

- `docs/tasks/ACTIVE_TASK.json`
- `docs/tasks/ACTIVE_TASK.md`
- `docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md`
- `docs/tasks/TASK_INDEX.md`
- `docs/roadmap/V1.0_ROADMAP.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`

## 2. 收口原因

逐张任务卡推进在已有代码规模下产生以下风险：

1. 同一用户功能被合同、数据库、Core、IPC和UI任务边界切断。
2. 后一张卡才发现前一张卡缺少必要字段、事件、类型守卫或恢复语义。
3. Prompt、TaskProtocol、Candidate、导入和恢复基础可能被重复封装。
4. 任务切换导致共享Schema、Migration、IPC入口和状态模型频繁变化。
5. 单卡完成易形成“后台已存在、用户不可用”或“UI已展示、权威链路未接”的假闭环。
6. 状态提取、校验、写作统计、备份等跨层能力需要统一数据生命周期和失败传播。
7. M7/M8后置体验与验收可能被迫返工早期局部实现。

因此，作者批准将剩余工作合并为一个整体任务，先读取全部要求与全量代码完成总规划，再连续实施。

## 3. M4-04整体范围

```text
已完成底座
├─ M0—M3
├─ M4-01 FTS
├─ M4-02 ConstraintPackage
└─ M4-03 Provider

唯一剩余任务 M4-04
├─ Prompt、GenerationRun与模型支持档案
├─ 作者工作流与产品体验收口
├─ T0/T1、改写、融合、候选审阅和采用
├─ 状态提取、校验与人物弧光一致性
├─ 搜索替换、写作统计与网文节奏
├─ DOCX、多格式导出与三轨恢复
├─ 向导、统一工作台、主题、无障碍与响应式
└─ 安全、性能、E2E、Eval、跨平台与发布关闭
```

## 4. 内部实施顺序

```text
1. 全量基线审计与整体规划
2. AI公共合同与运行底座
3. 作者体验与AI写作闭环
4. 状态提取、校验与连续性
5. 搜索、统计、导入与恢复
6. 完整体验、硬化与发布关闭
```

内部阶段只用于排序和复查，不是独立任务，不切换`ACTIVE_TASK`。

## 5. 单任务实施模式

```text
一个活动任务
→ 一个正式分支
→ 一个长期Draft PR
→ 多个可定位原子提交组
→ 每阶段代码审计与受影响回归
→ 全部完成后一次转Ready
→ 六项永久门禁通过后一次受控合并
→ 一次整体Verified关闭
```

正式分支固定为：`work/m4-04-v1-integrated-delivery`。

M4-04是V1最终任务，关闭后不自动激活下一任务。

## 6. 纵向闭环与共享真源

每项用户功能必须按实际影响完成：

```text
Contracts
→ Domain（适用）
→ Migration / Repository（适用）
→ Core Use Case
→ Electron Main
→ Preload
→ Renderer
→ 自动化与人工验收
→ 文档、追踪与证据
```

无影响层必须明确记录。以下公共能力只允许一套权威实现：

- Prompt Registry、Parser、Cleaner与Eval绑定。
- TaskProtocol、流式、取消、背压和任务快照。
- Candidate、Diff、ConflictSet、ApplyRecord和撤销。
- ImportPlan和导入提交协调器。
- RecoveryService、备份格式和恢复事务。
- 新手/专业模式、Appearance和Theme状态。

## 7. 历史冻结与兼容扩展

- 已完成任务卡、历史Evidence和已发布Migration保持冻结。
- 既有能力不足时，由M4-04追加兼容合同、Migration、Use Case和回归测试。
- 不通过改写历史目标或证据伪装新能力已完成。
- 不允许需要后续内部阶段才能解释、恢复或迁移的数据进入最终Ready Head。
- 无AI基础写作产品门始终有效。

## 8. 关闭条件

M4-04必须覆盖原M4-04—M8-03全部目标和P0验收，并完成：

- 全量质量、安全、Migration、Electron E2E、AI Eval和性能矩阵。
- Windows、macOS、Linux构建或明确可审计Blocked结论。
- P0-001—P0-075 Verified或明确Blocked。
- 追踪矩阵、功能目录、README、发布与恢复文档同步。
- 无P0数据、安全、恢复或作者裁决边界绕过。
- 统一证据保存到`docs/test-evidence/M4-04/`。
