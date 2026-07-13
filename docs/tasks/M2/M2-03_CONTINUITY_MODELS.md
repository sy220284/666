# M2-03 时间线、知情信息与伏笔

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m2-continuity-models`

## 目标

覆盖长篇创作中最常见的时间冲突、人物信息边界和伏笔生命周期问题。

## 依赖

M2-02。

## 关联

- 需求：REQ-019—REQ-021
- 验收：P0-038—P0-040

## 必读文档

- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/testing/TEST_STRATEGY.md`

## 实施内容

1. TimelineEvent、事件人物、地点与前置依赖。
2. 时间精度、持续时间和同一人物同一时间多地冲突规则。
3. KnowledgeState：knows、believes、suspects、misunderstands、unknown。
4. Foreshadowing生命周期、回收窗口、依赖和关联章节。
5. 提供列表式、可检索、可引用的UI数据接口。

## 非目标

不建设完整历法引擎、自动信息传播模拟和复杂图算法。

## 测试

不同时间精度、知情变化、伏笔迁移、依赖循环、软删除引用和跨项目关联拒绝。

## 完成条件

时间、知情和伏笔能够被约束包、校验和章节页面可靠读取，不依赖AI临时推断。
