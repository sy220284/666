# M3-02 约束包与FTS5检索

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m3-constraint-package`

## 目标

为每类AI任务组装可追溯、可裁剪、符合时序的本章上下文包。

## 依赖

M2-04、M3-01。

## 关联

- 需求：REQ-025
- 验收：P0-025、P0-026相关Eval

## 必读文档

- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`

## 实施内容

1. P0代码约束、P1章节必须项、P2设定状态、P3文风声音、P4辅助背景分层。
2. 读取当前章、SceneBeat、前章尾快照、实体当前状态、知情、伏笔和作品规则。
3. 使用确定性关联与FTS5补充召回。
4. 执行时序过滤、去重、冲突标记和来源记录。
5. 估算Token并保留安全边距。
6. 按P4→P3→低相关P2裁剪，不丢P0/P1。
7. 计算contentHash、constraintHash和来源Version ID。

## 非目标

V1不实现Embedding、向量库、Rerank和通用检索Adapter。

## 测试

必选项不被挤出；历史状态不冒充当前；stale快照不进入约束包；同输入Hash稳定；短中文搜索和trigram策略可用；超限返回明确错误。

## 完成条件

每次GenerationRun都可追溯实际使用的约束来源和裁剪结果，且相同输入产生稳定Hash。
