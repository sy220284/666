# C3 T0/T1 与结构化 Candidate 检查点

## 结论

C3 已完成 T0 多骨架与 T1 三种互斥来源的纵向闭环。所有结果先进入持久化
`GenerationRun` 与 Candidate；Renderer 不提交骨架正文、权威 SceneBeat 内容或来源全文。

## 实现

- Project Schema 24 追加 Skeleton 修订、Generation 输入来源和 Candidate 来源映射。
- Skeleton 与 Prose Candidate 使用严格判别联合：
  - Skeleton 只保存版本化结构化 Payload，`blockCount` 固定为 0。
  - Prose Candidate 必须保存正文块，不能携带 Skeleton Payload。
- T0 支持一次生成 1—5 个可比较骨架，Core 校验候选数量及必需 SceneBeat 覆盖。
- 作者可以保存新的 Skeleton 修订；父修订、Payload Hash、来源状态与编辑者均可追溯。
- T1 每次只能选择以下一种权威来源：
  - 已持久化 Skeleton Candidate；
  - 当前章节正式 SceneBeat；
  - 直接章节目标。
- Skeleton 来源过期时由 Core 判定，必须由作者明确确认后才能继续。
- 模型支持档案未验证时 T1 使用纯文本流；只有验证通过时才请求结构化正文块。
- 生成界面显示真实 Task/GenerationRun 阶段、Provider、模型、Prompt 版本和支持档位。
- Skeleton 在 Core 层禁止进入正文 Preview、Diff、Apply、Version 或定稿路径。

## 测试

- 严格判别 Candidate 合同、T1 单一来源合同与改写/融合锚点合同。
- Schema 24 空库安装、严格表、外键、触发器和 Skeleton/Prose 排斥。
- 多 Skeleton 原子提交、结果引用、修订链、Hash 复核和来源过期。
- T0/T1 权威来源解析、SceneBeat 归属和 stale 确认。
- 结构化多结果流、TaskProtocol 结果引用和真实任务状态。
- Renderer 生成、取消、partial、骨架审阅和来源追溯入口静态覆盖。

## 下一入口

C4 的改写、融合与审阅能力已与本检查点共用 Schema 24 和 Candidate 工作台实现，并在
`c4-rewrite-merge-review.md`单独记录其约束与回归。
