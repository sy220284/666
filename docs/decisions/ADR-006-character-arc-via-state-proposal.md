# ADR-006：人物弧光节点通过StateProposal确认

- 状态：Frozen
- 日期：2026-07-14

## 背景

REQ-045引入CharacterArc/ArcMilestone用于追踪人物成长、黑化、觉醒等长线转变。弧光节点是否"命中"本质上是对人物状态的一次判断，如果允许AI在状态提取阶段直接写入`arc_milestones.status`，会绕开ADR-004确立的"AI不得直接更新确认后的EntityState"原则，且弧光判断比位置、伤势等物理状态更主观，误判代价更高。

## 决策

1. 弧光节点的状态变化必须经过StateProposal流程，与其他EntityState变化同等对待，不单独开辟写入通道。
2. 状态提取Run识别到疑似命中某个ArcMilestone时，生成一条`proposal_type: "arc_milestone"`的StateProposal，附带证据锚点（章节、场景、正文片段引用）。
3. StateProposal处于pending时，`arc_milestones.status`保持原值（planned），不得提前显示为hit。
4. 作者接受、编辑或拒绝后，Core在单事务内更新`arc_milestones.status`，与ADR-004"接受项单事务更新EntityState"规则一致。
5. 弧光一致性校验（ARC-003）只读当前已确认状态，不读pending提案，避免用未决判断否定正文。

## 结果

### 正面

- 弧光数据和其他连续性数据（时间线、知情、伏笔）遵循同一套"AI提议、作者裁决"流程，不引入特例。
- 作者可以拒绝AI对人物转变的误判，不会被系统强行推进弧光阶段。

### 代价

- 弧光判断比物理状态更主观，误判率可能更高，需要在Prompt和Eval阶段针对性评估（见`PROMPT_AND_EVAL_SPEC.md`）。
- 增加了StateProposal的类型分支，UI需要为`arc_milestone`类型提供合适的展示（弧光进度而非单值变化）。

## 强制约束

- Repository层不得提供"AI直接更新`arc_milestones.status`"接口。
- ARC-003校验只能读取已确认（非pending）的弧光阶段。

## 验证

- StateProposal为pending时，`arc_milestones.status`不变。
- 未确认弧光提案写入率必须为0，与ADR-004的Candidate验证方式一致。
