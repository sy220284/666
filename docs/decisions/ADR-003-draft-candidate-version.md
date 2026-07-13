# ADR-003：Draft、Candidate、Version三层分离

- 状态：Frozen
- 日期：2026-07-13

## 背景

AI写作工具最危险的问题是候选文本、当前工作稿和历史定稿混在同一对象中，导致AI生成、作者修改和版本恢复互相覆盖。

## 决策

1. Draft是每章唯一可编辑工作稿。
2. Candidate是AI生成或融合后的备选结果，未经作者接受不得进入Draft。
3. Version是不可变历史快照，创建后无业务UPDATE路径。
4. `logicalBlockId`用于追踪同一逻辑段落在Draft、Candidate和Version中的对应关系。
5. Candidate记录`baseDraftRevision`；接受时检查当前Revision、块Hash和锁定状态。
6. 恢复历史Version时创建新Draft，不修改旧Version。

## 结果

### 正面

- AI试错不污染当前稿。
- 作者可以比较、部分采用、撤销和回滚。
- 历史版本具有稳定证据价值。

### 代价

- 数据模型和候选比较比单文档编辑器复杂。
- 需要块级Diff、冲突处理和空间清理策略。

## 强制约束

- GenerationRun的流式文本只进入临时预览，完成后持久化为Candidate。
- partial Candidate必须明确标记，不可直接定稿。
- Candidate采用必须在一个事务中完成，并生成可撤销记录。
- Version与VersionBlock不可被普通编辑命令修改。

## 验证

- AI生成中切换章节不会把文本写入其他Draft。
- 作者在生成期间编辑正文，Candidate仍可保存但采用时触发冲突检查。
- 恢复历史版本后，旧Version内容和Hash保持不变。
