# M10-07 正文变更与恢复安全收口

> 状态：In Progress  
> 优先级：P1  
> 基线：`main == work == 47bf112754a5ed28f7ede0565efeda5bb581f85e`

## 目标

修复全项目安全替换的块级 Revision 与错误传播缺口，补齐历史版本恢复前当前稿的可达留档和乐观锁，强化 Candidate Undo 状态迁移，并收敛 Generation Runtime 与确定性序列化的重复实现。

## 基线复核

当前实现存在以下已核实偏离：

1. Safe Replace 仅修改命中块内容，却将同一 Draft 的全部块提升到 committed Revision，并由专属 SQL 写入路径重复实现 Draft Patch 的部分语义。
2. Safe Replace 失败后，二次 stale 标记失败会覆盖原始错误。
3. Version Restore 会归档恢复前当前稿，但协议未携带当前 Draft ID/Revision，且用户没有 archived Draft 的读取入口。
4. Candidate Undo 的 `applied → undone` 条件 UPDATE 未断言 affected rows。
5. Generation 文本与结构化执行器重复维护流式生命周期。
6. 多个 Core 模块重复实现确定性 JSON 序列化，未来可能产生 Hash 语义漂移。

以下审计项经权威任务卡与生产调用链复核后不属于缺陷，本任务不修改：

- Safe Replace 不计入人工码字统计；
- 永久删除对 Generation 的 CASCADE 章节引用保持 blocker；
- Coordinated ImportPlan 已具备 TTL 清理与数量上限。

## 实施范围

### 1. Safe Replace 数据语义

- 查询并保留每个 DraftBlock 自身 Revision。
- 仅更新实际命中的块，未命中块 Revision 保持不变。
- retained block UPDATE 必须断言 `changes === 1`。
- Patch Log 审计快照记录每个块自身 Revision。
- 保持 Draft Revision、Hash、LockGuard、恢复点和单事务语义。

### 2. Safe Replace 错误保真

- stale 标记作为 best-effort 后置动作。
- stale 标记失败不得覆盖原始替换错误。
- 通过诊断 cause 保留原错误与后置错误，不使用空 catch 或散落 console 输出。

### 3. Version Restore 可恢复闭环

- Restore 输入增加 `expectedDraftId` 与 `expectedRevision`。
- Core 在同一事务内重新校验当前活动 Draft。
- 归档前创建不可变的“恢复前自动留档” checkpoint Version。
- 自动留档失败、归档失败或新 Draft 创建失败时完整回滚。
- Renderer 在 flush 成功后提交当前 Draft 身份，并明确提示自动留档结果。

### 4. Candidate Undo 不变量

- `candidate_apply_records` 状态迁移必须断言恰好影响一行。
- 断言失败时 Draft、Patch Log 与 ApplyRecord 在同一事务内回滚。

### 5. Generation Runtime 收敛

- 提取文本与结构化生成共享的 Provider 流、阶段、usage、字符上限、完成检查及失败持久化生命周期。
- Prose 与 Structured 仅保留解析、结果持久化和 partial failure 策略差异。
- 不改变取消、终态兼容、错误码和结果引用语义。

### 6. 确定性序列化

- 建立 Core 内部统一 stable JSON 工具。
- 对象键排序、数组顺序、primitive 语义保持现状。
- 迁移 Candidate、Draft、Version、Import、LockGuard 与 Recovery 使用点。
- 使用黄金向量锁定现有 Hash，不修改已持久化数据的校验结果。

## 非目标

- 不增加 archived Draft 管理工作台。
- 不修改人工写作统计口径。
- 不放宽永久删除的引用 blocker。
- 不持久化 ImportPlan。
- 不新增 Migration、生产依赖、云能力或第二套正文真源。
- 不改变 Version 与 VersionBlock 的不可变约束。

## 验收

1. 三块 Draft 仅替换一块时，只有命中块提升 Revision；数据库与 Patch Log 一致。
2. Safe Replace 原事务和 stale 后置动作同时失败时，调用方收到原始替换错误。
3. Version Restore 的 Draft ID 或 Revision 变化时拒绝执行且不产生留档或归档。
4. Restore 成功后，恢复前当前稿可从 Version 列表读取，目标历史 Version 保持不可变。
5. Candidate Undo 状态迁移零行或多行时事务回滚。
6. Generation Prose/Structured 的取消、流中断、空输出、字符上限、usage、partial 与 terminal 行为保持回归一致。
7. 统一序列化前后全部黄金 Hash 完全一致。
8. 任务要求的格式、类型、单元、集成、安全、性能、构建与 E2E 门禁真实通过。

## Evidence

最终证据保存到：`docs/test-evidence/M10-07/`
