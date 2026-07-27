# C4 改写、融合与 Candidate 审阅检查点

## 结论

C4已完成快速/结构性改写、Beat/Segment融合、partial作者裁决和统一Candidate审阅入口。所有采用继续复用M2-03的Revision、Hash、LockGuard、Checkpoint、ConflictSet、ApplyRecord与整体撤销，不存在AI直接写Draft的旁路。

## 实现

- 快速改写使用项目、章节、Draft、Revision、块Hash、选区边界和选中文本Hash组成的权威锚点；Core拒绝过期、锁定和Unicode代理对断点。
- 模型只返回替换文本，Core使用权威原块重建完整Prose Candidate。
- “换一个”复用同一改写意图和锚点，创建新的GenerationRun与Candidate。
- 结构性改写支持多个未锁定块，保存全部来源块和基础Revision。
- 融合使用严格判别的BeatSourceMapping或SegmentSourceMapping：
  - Beat模式支持逐SceneBeat选择Candidate或保留当前稿。
  - Segment模式允许无Beat Candidate按明确顺序融合。
  - Core拒绝跨项目/章节、Skeleton、已丢弃来源、重复顺序、重复块、重叠范围和过期Hash。
- 受控片段范围必须精确命中一个来源块，范围与文本Hash均由Core复核。
- merge Candidate记录Run、来源Candidate、来源块、来源单元、顺序和可选范围锚点。
- partial只能由作者保存或丢弃；保存后禁止默认整稿采用，并提供继续生成和手动补全入口。
- Candidate审阅显示来源任务、Provider/模型、Prompt、结构/字符差异、限制、冲突、采用摘要和整体撤销。

## 测试

- 精确选区重建、过期Hash、锁定块和Unicode边界。
- Segment Candidate来源解析、范围Hash、重复顺序与重叠来源拒绝。
- Candidate来源映射与Generation输入来源持久化。
- partial保存/丢弃、取消后迟到delta隔离、继续边界与重启查询。
- Skeleton/Prose硬隔离与partial整稿采用冲突。
- 长章节可取消Diff、候选采用事务、冲突、Checkpoint与撤销。
- Renderer Beat/Segment、换一个、继续生成、手动补全和审阅入口。

## 验证结论

产品源提交`9131a6db1f43d97e52aaa867010a316998f860fb`的Quality #2198完整矩阵、Security #1988和Performance #1954全部成功。改写、融合、Candidate审阅、采用与撤销链在Unit、Integration、Coverage和Electron E2E中通过。

C4验收通过。

## 后续边界

规则、统计与AI语义风险不在C4建立第二套结果模型；C5统一写入ValidationIssue、StoryTodo与Comment。
