# M4-04 V1剩余功能整体实施计划

> 状态：Baseline Planning Required  
> 归属任务：M4-04 WorldForge V1剩余功能整体实施与发布闭环  
> 作用：在任何新增功能代码前完成全量基线审计、冲突核实和实施顺序冻结。

## 1. 规划门

M4-04正式功能编码前必须完成本文件全部章节。结论必须来自当前`main`、全部被吸收需求文件、权威规格、真实代码、测试、Migration、IPC和最近相关提交；不得按任务卡假设代码仍为空白。

## 2. 当前已确认基线

### 已完成并冻结

- M0—M3全部任务已Verified。
- M4-01 FTS5、索引队列、权威回读、项目隔离和项目词典已Verified。
- M4-02 P0—P4约束包、时序过滤、稳定Hash、来源与裁剪追溯已Verified。
- M4-03 Provider、凭据、适配器、连接探测、端点分类与安全边界已Verified。

### 已知可复用能力

- Prompt Spike、Schema、Parser、Cleaner、ProviderStub与模式选择。
- TaskProtocol、MessagePort、delta批处理、背压、取消、订阅和活动任务快照。
- Draft Patch、Revision、Hash、LockGuard、Candidate、Diff、ConflictSet、ApplyRecord与Checkpoint。
- ProjectBrief、SceneBeat、Entity、Canon、EntityState、KnowledgeState、Foreshadowing、CharacterArc、StateProposal与EndingSnapshot。
- FTS、ConstraintPackage、Provider配置与凭据隔离。
- CoordinatedImportExportService、ImportPlan与RecoveryService。
- React Renderer、Tiptap、Zustand、窗口与主题基础。

## 3. 必做审计清单

### 3.1 需求映射

逐项填写：

| 需求来源 | 已有能力 | 缺口 | 冲突/漂移 | 实施阶段 | 测试/P0 |
|---|---|---|---|---|---|
| M4-04 | 待审计 | 待审计 | 待审计 | 第二阶段 | 待映射 |
| M4-05 | 待审计 | 待审计 | 待审计 | 第二阶段 | 待映射 |
| M5-00—M5-06 | 待审计 | 待审计 | 待审计 | 第三/四阶段 | 待映射 |
| M6-01—M6-06 | 待审计 | 待审计 | 待审计 | 第四/五阶段 | 待映射 |
| M7-01—M7-03 | 待审计 | 待审计 | 待审计 | 第六阶段 | 待映射 |
| M8-01—M8-03 | 待审计 | 待审计 | 待审计 | 第六阶段 | 待映射 |

### 3.2 纵向代码审计

```text
Contracts
→ Domain
→ Migration / Repository
→ Core Use Case
→ Electron Main
→ Preload
→ Renderer
→ Tests
→ Docs / Traceability / Evidence
```

每项功能记录实际影响层、已有入口、缺失接线、共享文件和失败传播。

### 3.3 共享合同总表

必须冻结：

- Prompt ID/Version、输入输出Schema、Cleaner与Eval绑定。
- T1三种互斥来源。
- GenerationRun、GenerationResultRef、partial和重启语义。
- Skeleton/Prose Candidate判别模型、Hash和类型守卫。
- StateProposalBatch、`source: provider`和作者裁决边界。
- ValidationIssue、ValidationAnchor、StoryTodo和Comment。
- ReplacePlan、`mutationOrigin`与人工写作统计口径。
- ImportPlan、RecoveryService和备份保留策略。
- StatusArbiter与最小只读状态投影边界。

### 3.4 Migration总规划

维护表：

| Migration | 阶段 | 所属合同 | 兼容范围 | 回滚/只读策略 | 状态 |
|---|---|---|---|---|---|

规则：只追加；同一提交组中的Schema、Repository、Use Case、升级测试和恢复影响必须闭合。

### 3.5 IPC与共享入口规划

维护：命令、Schema、Main注册、Preload白名单、Renderer消费者、错误码、事件、项目隔离与安全测试。禁止只改其中一层。

### 3.6 用户完整路径

至少覆盖：

1. 无AI基础写作、保存、Version、导出与恢复。
2. 继续写作、规划、设定与结构操作。
3. T0可选、T1三路径、改写、融合、审阅、采用与撤销。
4. 定稿、状态提取、作者裁决、校验与修订待办。
5. 搜索、替换、统计、DOCX、备份与恢复。
6. 首次向导、三条创作路径、全工作台、主题、无障碍与显示环境。
7. 发布安全、性能、跨平台与P0关闭。

每条路径覆盖空、加载、成功、失败、取消、冲突、只读、恢复和重启。

## 4. 内部实施顺序

1. 全量基线审计与合同冻结。
2. AI公共合同、Prompt和GenerationRun。
3. 作者体验、T0/T1、改写、融合、审阅和采用。
4. 状态提取、确定性校验、AI语义与人物弧光校验。
5. 搜索替换、mutationOrigin、写作统计与节奏指标。
6. DOCX、多格式导出、三轨备份和恢复中心。
7. 向导、统一工作台、主题、无障碍和响应式。
8. 安全、数据、性能、E2E、Eval、三平台构建与发布关闭。

顺序可在审计后调整，但必须说明上游、下游、数据兼容和测试影响。

## 5. 提交与复查账本

每个原子提交组记录：

- Head SHA与变更范围。
- 完成的用户路径。
- Contracts/Migration/IPC/UI变化。
- 实际运行的测试与退出码。
- 横向、纵向回归结论。
- 新增风险、兼容层和后续清理项。
- 是否可以安全继续下一内部阶段。

## 6. 规划完成条件

- 全部被吸收需求均有唯一实施归属。
- 已有能力、缺口、冲突和复用点基于真实代码确认。
- 不存在悬空Schema、Migration、IPC、UI或测试。
- 共享合同、Migration顺序、共享入口和用户路径已经冻结。
- 风险、回滚、测试和发布关闭矩阵完整。
- 计划经整体代码影响复核后，才允许进入第二阶段编码。
