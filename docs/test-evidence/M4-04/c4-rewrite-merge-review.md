# C4 改写、融合与 Candidate 审阅检查点

## 结论

C4 已完成快速/结构性改写、Beat/Segment 融合、partial 作者裁决和统一 Candidate
审阅入口。所有采用继续复用 M2-03 的 Revision、Hash、LockGuard、Checkpoint、
ConflictSet、ApplyRecord 与整体撤销，不存在 AI 直接写 Draft 的旁路。

## 实现

- 快速改写使用项目、章节、Draft、Revision、块 Hash、选区边界和选中文本 Hash
  组成的权威锚点；Core 拒绝过期、锁定和 Unicode 代理对断点。
- 模型只返回替换文本，Core 使用权威原块重建完整 Prose Candidate。
- “换一个”复用同一改写意图和锚点，创建新的 GenerationRun 与 Candidate。
- 结构性改写支持多个未锁定块，保存全部来源块和基础 Revision。
- 融合使用严格判别的 BeatSourceMapping 或 SegmentSourceMapping：
  - Beat 模式支持逐 SceneBeat 选择 Candidate 或保留当前稿。
  - Segment 模式允许无 Beat Candidate 按明确顺序融合。
  - Core 拒绝跨项目/章节、Skeleton、已丢弃来源、重复顺序、重复块、重叠范围和过期 Hash。
- 受控片段范围必须精确命中一个来源块，范围与文本 Hash 均由 Core 复核。
- merge Candidate 记录 Run、来源 Candidate、来源块、来源单元、顺序和可选范围锚点。
- partial 只能由作者保存或丢弃；保存后禁止默认整稿采用，并提供继续生成和手动补全入口。
- 继续生成引用原 Run、Prompt、约束 Hash 和已接收内容边界。
- Candidate 审阅显示来源任务、Provider/模型、Prompt、结构/字符差异、限制、冲突、
  采用摘要和整体撤销。

## 测试

- 精确选区重建、过期 Hash、锁定块和 Unicode 边界。
- Segment Candidate 来源解析、范围 Hash、重复顺序与重叠来源拒绝。
- Candidate 来源映射与 Generation 输入来源持久化。
- partial 保存/丢弃、取消后迟到 delta 隔离、继续边界与重启查询。
- Skeleton/Prose 硬隔离与 partial 整稿采用冲突。
- 长章节可取消 Diff、候选采用事务、冲突、Checkpoint 与撤销既有回归。
- Renderer Beat/Segment、换一个、继续生成、手动补全和审阅入口静态覆盖。

## 后续边界

规则、统计与 AI 语义风险不在 C4 建立第二套结果模型；C5 将统一写入
ValidationIssue/StoryTodo/Comment，并把改写、融合和 T1 的后置风险接回同一检查入口。
