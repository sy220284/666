# 已知风险

- V1只实现结构化世界时间值和精度，不实现完整历法换算；不同历法间的等价换算属于后续扩展。
- TimelineEvent当前提供参与者、地点和依赖关系；witness/subject角色虽由Schema预留，最小UI统一按participant写入。
- EntityState与KnowledgeState只接受作者明确命令。AI或规则提取的变化必须等待M3-06 StateProposal仲裁。
- 最小UI允许粘贴Version、Block与事件ID，后续Renderer迁移任务会统一升级为可搜索引用选择器。
- 人工桌面验收、正式截图和完整质量矩阵最终签字延期到批量验收。
- 只有PR六类永久门禁、Controlled Merge与Main Verification全部成功后，M3-04才可登记为Implemented。
