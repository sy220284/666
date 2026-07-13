# M2-02 实体、Canon与动态状态

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m2-canon-state`

## 目标

分离稳定设定与随剧情变化的状态，建立长篇连续性的权威数据基础。

## 依赖

M2-01。

## 关联

- 需求：REQ-017、REQ-018
- 验收：P0-036、P0-037

## 必读文档

- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/architecture/DATA_FLOW.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`

## 实施内容

1. Entity基表与人物、地点、势力、道具、能力、规则、事件、自定义类型。
2. 别名、摘要、状态和软删除。
3. CanonFact写入与历史保留。
4. EntityState：stateKey、value、validFrom、validUntil、recordStatus和evidence。
5. 当前状态和历史状态查询。
6. 阻止AI身份直接写入Canon和权威状态。

## 测试

同名别名、当前状态覆盖历史状态、状态失效、证据引用、跨项目实体拒绝和Canon权限边界。

## 完成条件

稳定事实与动态状态在Schema、Repository、UI和权限层均明确分离，后续AI只能生成提案。
