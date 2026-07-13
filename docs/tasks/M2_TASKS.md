# M2 任务卡：规划、设定与连续性

## M2-01 任务书、大纲、章节与SceneBeat

- 目标：建立不强迫流程、但能支持长篇结构和AI约束的规划模型。
- 依赖：M1。
- 分支：`feat/m2-planning-model`
- 关联：REQ-014、016，P0-033、034。

### 实现

- ProjectBrief最小字段。
- Volume、Chapter、PlotNode、SceneBeat和关联实体表。
- `orderKey`排序与事务性移动。
- 新手问题式入口和专业完整字段使用同一数据。
- 规划与正文单向安全关联：改大纲不自动修改Draft。
- 场景卡删除不删除正文；正文可选择转场景卡。

### 测试

空白项目、跳过任务书、树节点移动、场景排序、删除恢复和规划变化后正文不变。

---

## M2-02 实体、Canon与动态状态

- 目标：分离稳定设定与会随剧情变化的状态。
- 依赖：M2-01。
- 分支：`feat/m2-canon-state`
- 关联：REQ-017、018，P0-036、037。

### 实现

- Entity基表与人物、地点、势力、道具、能力、规则、事件、自定义类型。
- 别名、摘要和状态。
- CanonFact写入和历史保留。
- EntityState：stateKey、value、validFrom/Until、recordStatus和evidence。
- 当前状态与历史状态查询。
- AI身份无Canon写入Use Case。

### 测试

同名别名、当前状态覆盖历史状态、状态失效、证据引用、跨项目实体拒绝和Canon权限边界。

---

## M2-03 时间线、知情信息与伏笔

- 目标：覆盖长篇最常见的时间、信息差和伏笔连续性。
- 依赖：M2-02。
- 分支：`feat/m2-continuity-models`
- 关联：REQ-019—021，P0-038—040。

### 实现

- TimelineEvent、事件人物、地点与前置依赖。
- 顺序、持续和同一人物同一时间多地冲突规则。
- KnowledgeState：knows/believes/suspects/misunderstands/unknown。
- Foreshadowing生命周期、回收窗口和关系表。
- 页面与章节/SceneBeat关联。

### 非目标

不建设完整历法引擎、自动信息传播模拟和复杂图算法。

### 测试

时间精度不同时的冲突规则、知情状态变化、伏笔状态迁移、依赖循环提示和软删除引用。

---

## M2-04 定稿、状态提案、尾快照与失效传播

- 目标：将定稿章节安全转成下一章可用的连续性入口。
- 依赖：M2-03、M1-04。
- 分支：`feat/m2-state-proposals-snapshots`
- 关联：REQ-022，P0-041、042。

### 实现

- 章节定稿创建final Version。
- 规则或Provider Stub生成StateProposal，包含旧值、新值、证据和置信等级。
- 接受、编辑后接受、拒绝。
- 接受后在单事务内更新EntityState并创建EndingSnapshot。
- 旧章重新定稿时按变更类型标记后续Snapshot、校验和缓存stale。
- 纯文字润色不触发状态级联。

### 安全

- pending提案不得改变权威状态。
- 静态Canon只生成冲突提示。
- 不自动改写后续正文。

### 测试

无证据提案、旧值已变化、批量接受、拒绝、事务失败、纯润色、位置变化和伏笔删除的差异化失效。
