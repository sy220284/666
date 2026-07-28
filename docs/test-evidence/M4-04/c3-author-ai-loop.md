# C3 T0/T1 与结构化 Candidate 检查点

## 结论

C3已完成T0多骨架与T1三种互斥来源的纵向闭环。所有结果先进入持久化`GenerationRun`与Candidate；Renderer不提交骨架正文、权威SceneBeat内容或来源全文。

## 实现

- Project Schema 24追加Skeleton修订、Generation输入来源和Candidate来源映射。
- Skeleton与Prose Candidate使用严格判别联合：
  - Skeleton只保存版本化结构化Payload，`blockCount`固定为0。
  - Prose Candidate必须保存正文块，不能携带Skeleton Payload。
- T0支持一次生成1—5个可比较骨架，Core校验候选数量及必需SceneBeat覆盖。
- 作者可以保存新的Skeleton修订；父修订、Payload Hash、来源状态与编辑者均可追溯。
- T1每次只能选择以下一种权威来源：
  - 已持久化Skeleton Candidate；
  - 当前章节正式SceneBeat；
  - 直接章节目标。
- Skeleton来源过期时由Core判定，必须由作者明确确认后才能继续。
- 模型支持档案未验证时T1使用纯文本流；只有验证通过时才请求结构化正文块。
- 生成界面显示真实Task/GenerationRun阶段、Provider、模型、Prompt版本和支持档位。
- Skeleton在Core层禁止进入正文Preview、Diff、Apply、Version或定稿路径。

## 测试

- 严格判别Candidate合同、T1单一来源合同与改写/融合锚点合同。
- Schema 24空库安装、严格表、外键、触发器和Skeleton/Prose排斥。
- 多Skeleton原子提交、结果引用、修订链、Hash复核和来源过期。
- T0/T1权威来源解析、SceneBeat归属和stale确认。
- 结构化多结果流、TaskProtocol结果引用和真实任务状态。
- Renderer生成、取消、partial、骨架审阅和来源追溯入口。

## 验证结论

产品源提交`9131a6db1f43d97e52aaa867010a316998f860fb`的Quality #2198完整矩阵、Security #1988和Performance #1954全部成功。C3合同、Migration、生成来源解析、Renderer入口、Coverage和Electron E2E均通过。

C3验收通过。

## 下一入口

C4的改写、融合与审阅能力与本检查点共用Schema 24和Candidate工作台，并在`c4-rewrite-merge-review.md`单独记录。
