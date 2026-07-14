# M3 里程碑：AI生成闭环

> 状态：Approved summary  
> 一任务一文件为唯一执行依据。

## 目标

完成Provider接入、约束包、T0/T1、快速与结构性改写、融合、流式取消、Candidate Diff、冲突与安全采用。

## 任务

1. [`M3-01 Provider、连接测试与凭据`](M3/M3-01_PROVIDER_LAYER.md)
2. [`M3-02 约束包与FTS5检索`](M3/M3-02_CONSTRAINT_PACKAGE.md)
3. [`M3-03 T0/T1、快速改写、融合与取消`](M3/M3-03_GENERATION_WORKFLOWS.md)
4. [`M3-04 候选Diff、冲突、采用与回退`](M3/M3-04_CANDIDATE_REVIEW.md)

## 退出条件

- Provider协议、凭据和隐私边界通过测试。
- 约束包可追溯、可裁剪且时序正确。
- 流式输出不直接写Draft。
- AI任务可取消、可恢复、可降级。
- Candidate Diff达到性能预算。
- 冲突必须由作者处理，采用可撤销和回退。
