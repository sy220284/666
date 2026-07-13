# M2-04 定稿、状态提案、尾快照与失效传播

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m2-state-proposals-snapshots`

## 目标

将章节定稿安全转换为下一章可使用的连续性入口，并在旧章返修后精确标记派生数据失效。

## 依赖

M2-03、M1-04。

## 关联

- 需求：REQ-022
- 验收：P0-041、P0-042

## 必读文档

- `docs/architecture/DATA_FLOW.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`

## 实施内容

1. 章节定稿创建final Version。
2. 规则或Provider Stub生成StateProposal，包含旧值、新值、证据和置信度。
3. 支持接受、编辑后接受和拒绝。
4. 接受后单事务更新EntityState并创建EndingSnapshot。
5. 旧章重新定稿时按变化类型标记后续Snapshot、校验和缓存stale。
6. 纯文字润色不触发状态级联。
7. 不自动改写后续正文。

## 测试

无证据提案、旧值变化、批量接受、拒绝、事务失败、纯润色、位置变化、事件结果变化和伏笔删除。

## 完成条件

pending提案不改变权威状态；尾快照可被下一章约束包读取；失效传播有类型边界且不修改后文。
