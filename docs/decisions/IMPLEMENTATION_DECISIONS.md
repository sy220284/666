# WorldForge 实现级冻结决策

> 状态：Frozen  
> 目的：消除多个任务之间会反复选择的底层实现分歧。若真实Spike证明某项无法达到验收，必须先更新本文件和相关规格，再改代码。

## DEC-001 ID生成

### 决策

V1.0业务主键统一使用标准UUID字符串，通过Node内置`crypto.randomUUID()`生成。

### 理由

- 不新增依赖。
- 跨进程、离线和导入场景可独立生成。
- 排序由`created_at`和`order_key`承担，不依赖ID顺序。

### 约束

- 统一小写带连字符格式。
- Renderer不得决定权威业务ID；需要预生成时由Core或受控Domain工厂完成。
- 外部导入ID必须转换为本项目ID，并保留sourceId映射。

## DEC-002 排序键

### 决策

V1.0使用64位整数间隔排序键：初始间隔`1024`。

### 行为

- 插入两项之间时优先使用中点。
- 无可用整数时，仅对同一父节点的兄弟项执行局部重排。
- 重排在单事务内完成。
- 不使用LexoRank库和浮点数。

### 验收

连续插入、拖动、跨父节点移动和中途失败后顺序稳定，无重复键。

## DEC-003 Draft Revision与持久化回退

### 决策

- 每个成功的Draft Patch事务只递增一次Revision。
- 不为每次自动保存创建完整Version。
- 普通文字编辑的短期撤销由ProseMirror历史栈承担。
- Candidate采用、批量替换、拆章、并章、迁移和导入等高风险操作必须创建持久化ApplyRecord或Checkpoint。
- 作者主动创建历史版本和章节定稿时生成不可变Version。

### 检查点策略

V1.0不以固定“每N次自动保存”无限生成永久快照。若崩溃恢复测试证明仅靠已提交Draft和高风险Checkpoint不足，再通过独立任务增加压缩修订日志。

## DEC-004 Patch格式

### 决策

Block Patch是有序操作数组：

```ts
type BlockPatchOperation =
  | { type: 'insert'; afterLogicalBlockId: string | null; block: NewBlock }
  | { type: 'update'; logicalBlockId: string; expectedHash: string; content: string; attributes?: BlockAttributes }
  | { type: 'delete'; logicalBlockId: string; expectedHash: string }
  | { type: 'move'; logicalBlockId: string; expectedHash: string; afterLogicalBlockId: string | null };
```

### 规则

- 一个Patch批次以同一`baseRevision`提交。
- Core按顺序在内存工作集上验证，全部通过后事务写入。
- 任一操作失败则整批回滚。
- 锁定块检查覆盖源块和受合并影响的相邻块。
- inverse patch只在成功提交后生成并保存于需要持久回退的操作记录。

## DEC-005 logicalBlockId继承

### 拆分

段落在光标处分为左右两块：

- 左块保留原`logicalBlockId`。
- 右块获得新ID。

### 合并

相邻两块合并：

- 前块保留`logicalBlockId`。
- 后块ID写入操作来源映射，用于Candidate Diff和历史审计。

### 移动

移动不改变`logicalBlockId`。

### 恢复Version

恢复生成新DraftBlock记录ID，但保留VersionBlock中的`logicalBlockId`。

## DEC-006 FTS5中文检索

### 决策

V1.0正文和中文长文本索引优先使用FTS5 `trigram` tokenizer；结构化短字段保留标准化精确查询和必要的`unicode61`索引。

### 原因

中文没有稳定空格边界，默认词元策略不能满足人名、短语和片段召回。trigram无需建设分词服务或向量检索。

### 实施门

M0/M4启动时必须检测当前SQLite构建是否支持`trigram`：

- 支持：启用并运行中文Fixture。
- 不支持：任务Blocked，评审升级SQLite/better-sqlite3版本或采用仓库内确定性分词预处理。
- 禁止静默退化为明显不可用的中文搜索。

### 查询

- 用户查询少于3个字符时走标准化`LIKE`/精确别名查询或短词索引。
- FTS结果返回业务记录ID，再读取业务真源。

## DEC-007 FTS更新

### 决策

V1优先使用显式索引任务，不把复杂业务文本拼装全部放入数据库触发器。

- 同一业务事务提交后写入索引队列。
- 索引失败不回滚已成功的正文事务，但标记索引stale。
- 搜索页显示索引状态并允许重建。
- FTS可完整删除和重建。

## DEC-008 StyleProfile存储

### 决策

StyleProfile的核心标识、名称、来源、频道、锁定状态使用普通列；可扩展参数保存为JSON文本，并由`packages/contracts`中的版本化Zod Schema验证。

```ts
interface StyleProfilePayloadV1 {
  schemaVersion: 1;
  sentence: { min: number; max: number; target: number };
  paragraph: { min: number; max: number; target: number };
  ratios: {
    dialogue: number;
    action: number;
    description: number;
    innerMonologue: number;
  };
  pace: 'slow' | 'moderate' | 'fast';
  pov: 'first' | 'third_limited' | 'third_omniscient';
  narrativeDistance: 'close' | 'medium' | 'distant';
  showVsTell: number;
  tolerance: number;
}
```

详细Schema在文风任务激活时落入代码；数据库中的JSON必须带`schemaVersion`。

## DEC-009 时间与日期

- 持久化时间统一为UTC ISO-8601字符串，精度到毫秒。
- UI按系统时区展示。
- 小说世界时间线使用独立字段和精度，不与系统时间混用。
- 测试使用可注入Clock，禁止依赖真实当前时间。

## DEC-010 内容Hash

- 使用SHA-256。
- Hash输入为标准化UTF-8内容及影响语义的块属性。
- 不包含数据库记录ID、更新时间和纯UI属性。
- 标准化函数位于Domain或Editor Core单一位置，并有跨平台Fixture。

## DEC-011 Core任务并发

- SQLite业务写单队列。
- Provider网络请求可并行。
- 每个项目的同一Draft写操作仍按队列顺序提交。
- CPU任务超过100ms事件循环预算时使用Worker线程或分片。
- 未达到量化阈值不拆独立AI服务进程。

## DEC-012 UI组件与样式

- Radix UI只承担无障碍行为基础。
- 页面样式使用集中Design Token和CSS变量。
- Tailwind可用于Token映射和布局，不允许业务组件散落任意颜色值。
- 不引入第二套完整组件库。

## DEC-013 Prompt注册

- 每个Prompt必须有稳定`promptId`和整数`version`。
- Prompt正文放在`packages/prompts`，不散落在UI和Use Case。
- GenerationRun记录`promptId`、`promptVersion`和`constraintHash`。
- Prompt变更需要运行对应Eval。

## DEC-014 自动保存

- 默认空闲时间800ms。
- composition期间不提交。
- 切章、创建Version、进入候选采用和正常关闭前强制flush。
- 保存请求在前一个请求未完成时合并后续本地修改，不并行写同一Draft。
- 保存失败后不得显示已保存，也不得以失败Revision继续Candidate采用。

## DEC-015 错误与诊断

- Renderer只依据稳定错误码做业务判断。
- 内部堆栈、SQL、正文值、密钥和完整路径不通过IPC返回。
- 诊断日志使用诊断ID关联。
- 用户取消不是红色错误。

## DEC-016 EndingSnapshot缺失时约束包回退

### 背景

`DATA_FLOW.md`§4将状态提取Run定义为“可选”，即章节可以定稿但作者未运行状态提取，此时`EndingSnapshot`从未生成。`M3-02_CONSTRAINT_PACKAGE.md`只规定了“stale快照不进入约束包”，未覆盖“快照不存在”这一分支，两者是不同状态，需要分别定义行为。

### 决策

约束包组装第2步（读取前章有效EndingSnapshot）按以下规则处理：

- **快照存在且非stale**：正常读取使用。
- **快照stale**：不进入约束包，按现有规则处理（不使用）。
- **快照从未生成（缺失）**：不阻塞生成，直接回退到查询`EntityState`、知情信息和伏笔当前权威表，现场组装P1层内容；GenerationRun记录`snapshotSource: "fallback_live_query"`，供后续追溯；UI在发起生成前提示“前章尚未生成尾快照，将直接读取当前状态，建议先处理状态提案”，提示不阻塞操作。

### 原因

状态提取是可选步骤，若因此阻塞下一章生成，会强迫作者做不必要的操作，违反“系统只标记和提示，不强制机械化确认”的降噪原则（见ADR-004）。直接回退直查保证约束包始终可组装，同时`snapshotSource`字段保留可追溯性。

## 变更流程

修改冻结决策必须：

1. 提供真实失败Fixture、性能数据或兼容性证据。
2. 列出受影响Schema、IPC、任务、测试和迁移。
3. 更新本文件、相关专项文档和追踪矩阵。
4. 获得作者明确批准。
5. 在独立任务中实施，不与普通功能顺手混入。
