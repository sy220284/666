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

## 自动化记录

- 首批实现工作流：`30103281554`，通过专项单元/集成、全仓Typecheck、Lint、Eval与任务状态校验。
- 时序与性能加固工作流：`30104373569`，通过首章时序、未来章隔离、短中文、超限、去重、150万字符性能、Typecheck、Lint、Eval与任务状态校验。
- 完整收口运行：`30104784660`（https://github.com/sy220284/666/actions/runs/30104784660）。Lint、Typecheck、145个测试文件/718项测试、25/25 Electron E2E、Security、Eval、43个Integration文件/124项测试、10个Performance文件/37项测试和任务状态校验全部通过；运行最终仅因追踪矩阵旧文本定位失败而返回failure，未发生代码或测试失败。
- 证据固化与任务推进运行：`30106994335`（https://github.com/sy220284/666/actions/runs/30106994335），修复矩阵定位、生成Manifest并执行`taskctl advance`。
- M4-01启动前基线整改记录见`m401-baseline-audit.md`。
