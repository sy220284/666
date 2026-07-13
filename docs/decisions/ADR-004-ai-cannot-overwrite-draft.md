# ADR-004：AI不得直接覆盖作者正文

- 状态：Frozen
- 日期：2026-07-13

## 背景

Prompt无法保证模型永远遵循边界。若AI工具拥有直接更新正文和设定的权限，模型幻觉、旧Revision和操作误判会造成不可逆修改。

## 决策

1. AI只能创建Candidate、ValidationIssue、StateProposal、摘要和日记候选。
2. AI不得直接更新活动Draft、静态Canon、确认后的EntityState或不可变Version。
3. 作者接受Candidate时，由Core依据明确选择生成Block Patch并执行事务。
4. 静态设定冲突只提示，不自动修正。
5. 状态提案必须附正文证据，并经接受、编辑后接受或拒绝。
6. Prompt约束属于质量控制，不属于安全边界。

## 结果

### 正面

- 模型能力差异不会突破数据安全线。
- 作者始终保有最终裁决权。
- 所有AI影响均可追溯到Run、Candidate和接受动作。

### 代价

- 高频AI操作需要快速通道和良好撤销体验，避免审阅摩擦过高。
- 状态确认需要降噪，否则可能机械化。

## 强制约束

- Repository层不得提供“AI直接保存正文”接口。
- 快速改写虽然使用内联交互，仍需经过锁定检查、来源标记和原子撤销。
- AI校验结果不得成为阻断正文编辑的唯一依据。
- 自动日记不得直接回写Canon和状态。

## 验证

- 对所有AI命令进行故障注入，确认活动Draft只在作者接受命令后变化。
- StateProposal在pending状态时，EntityState保持不变。
- 未确认Candidate写入率必须为0。
