# M10-16 已知风险与回退边界

## 剩余风险

1. **语义摘要成本（Low）**  
   Validation 需要读取项目权威语义状态计算摘要。Catalog 已按单次请求缓存项目、章节和版本摘要，避免随历史 Batch 数量重复全表扫描；超大项目仍需通过现有 Performance 门持续观察。

2. **无 Final 锚点领域编辑（Low，设计内）**  
   Timeline、Foreshadowing 等直接作者编辑不一定存在合法 `sourceVersionId`。本任务明确不伪造版本来源，而由权威领域状态摘要使旧 Validation 失效。后续若 Schema 增加独立语义 revision，应迁移到统一身份机制，不能并存两套 freshness。

3. **AI 运行期保守失效（Low，设计内）**  
   AI Validate 运行期间只要相关权威语义发生变化，结果会被判 semantic stale，即使变化最终与某条 Issue 无关。这是为了避免旧上下文结果冒充当前事实的保守策略。

4. **历史 Validation / Proposal 保留（Low）**  
   stale 结果继续保留用于审计，因此项目长期使用后历史记录会增长。清理策略若后续增加，必须区分审计历史与派生缓存，不能以删除历史记录替代 freshness 判断。

5. **数据库 Trigger 是 Snapshot 单一所有者（Medium，架构边界）**  
   EndingSnapshot stale 依赖现有 Migration 18/19 Trigger。后续 Core 重构不得重新引入 Service 侧平行 stale 写入；修改 Trigger 需要独立 Migration 治理。

## 回退边界

- 不恢复 `DerivedInvalidationService` 或 `snapshotRow()` 直接写旧 EndingSnapshot stale 的路径；
- 不扩展 StateProposal 持久化状态枚举来表达 freshness；
- 不允许 stale Proposal Accept/Edit-Accept；
- 不把 anchor freshness 与 semantic freshness 重新压成单一布尔状态；
- 不从 Rule/AI fingerprint 移除 SceneBeat、权威语义、Constraint 或 Prompt 身份；
- 不为缺少来源的领域编辑伪造 `sourceVersionId`；
- 不删除历史 Proposal/Validation 来伪造“当前”；
- 不修改已发布 Migration、Schema、生产依赖或锁文件规避本任务问题；
- 不降低 Coverage、Security、Performance、Build 或 Electron E2E 门禁。
