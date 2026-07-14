# WorldForge 实现级冻结决策

> 状态：Frozen  
> 目的：消除跨任务重复选择。真实Spike证明不可达时，先更新决策、专项规格和追踪矩阵，再修改代码。

## DEC-001 业务ID

- V1.0业务主键统一使用小写带连字符UUID。
- 由Core使用Node `crypto.randomUUID()`生成。
- Renderer不得决定权威ID；导入外部ID时转换并保留来源映射。

## DEC-002 排序键

- 所有`order_key`使用SQLite `INTEGER`承载64位整数。
- 初始间隔1024；插入优先取中点。
- 无可用整数时只对同一父节点兄弟项局部重排。
- 重排必须在单事务内完成；不使用LexoRank和浮点数。

## DEC-003 Draft、Revision与持久化回退

- 每次成功Draft Patch事务只递增一次Revision。
- 不为每次自动保存创建完整Version。
- 每章可有历史Draft，但只能有一个`active` Draft。
- 普通编辑撤销使用ProseMirror历史栈。
- Candidate采用、批量替换、拆并章、Migration和导入等高风险操作创建ApplyRecord或Checkpoint。
- 作者主动保存和定稿创建不可变Version。

## DEC-004 Block Patch格式

```ts
type BlockPatchOperation =
  | { type: 'insert'; afterLogicalBlockId: string | null; block: NewBlock }
  | { type: 'update'; logicalBlockId: string; expectedHash: string; content: string; attributes?: BlockAttributes }
  | { type: 'delete'; logicalBlockId: string; expectedHash: string }
  | { type: 'move'; logicalBlockId: string; expectedHash: string; afterLogicalBlockId: string | null };
```

- 一个批次使用同一`baseRevision`。
- Core先在内存工作集按顺序验证，全部通过后单事务写入。
- 任一操作失败整批回滚。
- 锁定检查覆盖源块及受拆分、合并影响的相邻块。

## DEC-005 logicalBlockId继承

- 拆分：左块保留原ID，右块获得新ID。
- 合并：前块保留ID，后块ID进入来源映射。
- 移动：ID不变。
- 恢复Version：创建新记录ID，保留logicalBlockId。

## DEC-006 FTS5中文检索

- 中文长文本优先使用FTS5 `trigram` tokenizer。
- 短字段保留标准化精确查询；少于3字符走LIKE、别名或短词索引。
- M0-03/M4-01检测当前SQLite是否支持trigram。
- 不支持时任务Blocked，评审SQLite版本或确定性预处理；禁止静默退化。

## DEC-007 FTS更新

- 使用显式`search_index_queue`，不以复杂触发器拼装全文。
- 业务事务提交后写索引队列。
- 索引失败不回滚正文，但标记stale并允许重建。
- FTS只返回业务ID，再读取权威数据。

## DEC-008 StyleProfile与GenreRhythmProfile

- 核心标识使用普通列，可扩展参数使用带`schemaVersion`的JSON。
- JSON由`packages/contracts`中的版本化Zod Schema验证。
- GenreRhythmProfile阈值由作者编辑，禁止在代码中散落魔法数字。

## DEC-009 时间

- 持久化时间统一为UTC ISO-8601毫秒字符串。
- UI按系统时区展示。
- 小说世界时间使用独立值和精度。
- 测试使用可注入Clock。

## DEC-010 内容Hash

- 使用SHA-256。
- 输入为标准化UTF-8文本及影响语义的块属性。
- 不包含记录ID、更新时间和纯UI属性。
- 标准化函数位于Domain或Editor Core单一位置。

## DEC-011 Core并发

- SQLite业务写单队列。
- Provider网络请求可以并行。
- 同一Draft写入仍按队列顺序提交。
- CPU任务连续阻塞超过100ms时使用Worker或分片。
- 无量化证据不拆独立AI进程。

## DEC-012 UI组件与主题

- Radix UI只承担无障碍行为基础。
- 页面样式使用集中Design Token和CSS变量。
- Theme A/Theme B只替换Token、图标、字体和表现动画，不改变业务命令、状态机或数据。
- 不引入第二套完整组件库。

## DEC-013 Prompt注册与追溯

- 每个Prompt有稳定`promptId`和整数`version`。
- Prompt只存放于`packages/prompts`。
- GenerationRun记录`promptId`、`promptVersion`和`constraintHash`。
- Prompt变化运行对应Eval并更新ModelSupportProfile。

## DEC-014 自动保存

- 默认800ms空闲保存。
- composition期间不提交。
- 切章、创建Version、进入Candidate采用和正常关闭前强制flush。
- 前一个保存未完成时合并后续本地修改，不并行写同一Draft。
- 保存失败不能显示已保存，也不能以失败Revision继续采用。

## DEC-015 错误与诊断

- Renderer只依据稳定错误码判断业务行为。
- 堆栈、SQL、正文、密钥和完整本地路径不通过IPC返回。
- 诊断日志使用诊断ID关联。
- 用户取消不显示红色错误。

## DEC-016 EndingSnapshot缺失回退

约束包组装读取前章快照时：

- 存在且有效：正常使用，记录`snapshotSource: "snapshot"`。
- stale：不使用，按权威当前表组装并记录来源。
- 从未生成：不阻塞，回退查询EntityState、KnowledgeState、Foreshadowing和已确认ArcMilestone，记录`snapshotSource: "fallback_live_query"`。

对应任务：`M4-02_CONSTRAINT_PACKAGE.md`。

## DEC-017 StateProposal双类型

- `proposal_type`仅允许`entity_state | arc_milestone`。
- entity_state提案目标为`entity_id + state_key`。
- arc_milestone提案目标为`arc_milestone_id`，建议值为`hit`或`skipped`。
- pending提案不能改变EntityState或ArcMilestone。
- 接受、编辑接受和拒绝均通过统一StateProposal Use Case。

## DEC-018 V1.0数据最小化

- P1/V1.5功能在任务启动前不预建无消费方表。
- V1.0 P0初始Schema不包含研究笔记、附件、项目日记、自动记忆调度和向量索引。
- 功能升级通过追加Migration实现，不以“未来可能需要”扩大P0数据库。

## 变更流程

修改本文件必须：

1. 提供真实失败Fixture、性能或兼容性证据。
2. 列出受影响Schema、IPC、任务、UI、测试和Migration。
3. 更新专项唯一真源和追踪矩阵。
4. 获得作者明确批准。
5. 在独立任务中实施。
