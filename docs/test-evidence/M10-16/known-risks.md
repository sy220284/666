# M10-16 已知风险与回退边界

## 剩余风险

1. **语义摘要成本（Low）**  
   Validation 需要读取项目权威语义状态计算摘要。Catalog 已按单次请求缓存项目、章节和版本摘要，避免随历史 Batch 数量重复全表扫描；超大项目继续由 Performance 门观察。

2. **无 Final 锚点领域编辑（Low，设计内）**  
   Timeline、Foreshadowing 等直接作者编辑不一定存在合法 `sourceVersionId`。本任务不伪造版本来源，而由权威领域状态摘要使旧 Validation 失效。未来若引入独立 semantic revision，应迁移到统一身份机制，不能并存两套 freshness。

3. **AI 运行期保守失效（Low，设计内）**  
   Validate Run 在模型调用前持久化 semantic identity；运行期间任一参与身份的权威语义变化都会使结果 stale，即使变化最终与某条 Issue 无关。这是防止旧上下文冒充当前事实的保守策略。

4. **内部 Generation metadata 版本化（Low）**  
   Validate Run 起点身份存入既有 `generation_input_sources.metadata_json` 的内部 key。requestId replay 明确剥离该 key 后比较原命令；后续若升级 key/version，必须同时维护读取兼容和 replay 排除规则。

5. **历史 Validation / Proposal 保留（Low）**  
   stale 结果继续保留用于审计，长期项目记录会增长。后续清理策略必须区分审计历史与派生缓存，不能以删除历史记录替代 freshness 判断。

6. **数据库 Trigger 是 Snapshot 单一所有者（Medium，架构边界）**  
   EndingSnapshot stale 依赖既有 Migration 18/19 Trigger。后续 Core 重构不得重新引入 Service 侧平行 stale 写入；修改 Trigger 需要独立 Migration 治理。

7. **PlotTree refresh 生命周期（Low，已锁定回归）**  
   Outline move 必须先完成 command，再显式 refresh，随后写作者状态；不能把 refresh 再放回该组件的 `useBridgeCommand(onSuccess)`，否则 refresh 期间组件卸载会失效 command token。完整 Electron E2E 已锁住此路径。

## 回退边界

- 不恢复 `DerivedInvalidationService` 或 `snapshotRow()` 直接写旧 EndingSnapshot stale；
- 不扩展 StateProposal 持久化状态枚举表达 freshness；
- 不允许 stale Proposal Accept/Edit-Accept；
- 不把 anchor freshness 与 semantic freshness 压回单一布尔状态；
- 不从 Rule/AI fingerprint 移除 SceneBeat、权威语义、Constraint 或 Prompt 身份；
- 不恢复基于跨时钟 `created_at/updated_at` 的 AI 运行期 freshness 守卫；
- 不为缺少来源的领域编辑伪造 `sourceVersionId`；
- 不删除历史 Proposal/Validation 来伪造“当前”；
- 不把 freshness 辅助 Schema 重新暴露到冻结 Contract 根运行时公共面；
- 不修改 AR-08 冻结测试基线掩盖公共面扩张；
- 不把 PlotTree refresh 重新放回会因自身卸载而失效的 command success 生命周期；
- 不放宽 Planning E2E 接受错误状态文案；
- 不修改已发布 Migration、Schema、生产依赖或锁文件规避问题；
- 不降低 Coverage、Security、Performance、Build 或 Electron E2E 门禁。
