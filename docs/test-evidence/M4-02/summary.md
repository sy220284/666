# M4-02 实施证据摘要

## 当前实现

- 定义P0—P4约束包、来源、时序、冲突、Hash与裁剪日志合同。
- Core从ProjectBrief、当前章、SceneBeat、前章EndingSnapshot或权威回退、EntityState、Knowledge、Foreshadowing、Canon、人物弧光、当前稿和公共检索组装。
- Domain执行稳定序列化、确定性Token估算和P4→P3→低相关P2裁剪；P0/P1预算不足时明确失败。
- Prompt层提供确定性序列化，不接入Provider。

## 自动验证

由正式PR的GitHub Actions记录为准；本提交在推送前运行专项单元、集成、Typecheck、Lint、Eval和任务状态校验。

## 复核加固

- 首章不读取本章尾快照，阻断章末状态倒灌到章前约束。
- 公共检索补充按章节顺序过滤未来章，Version明确标记为historical。
- Entity资料使用独立来源类型；精确重复的补充召回不再重复占用Token。
- 增加短中文搜索、首章时序、未来章隔离、服务超限与150万字符性能回归。
