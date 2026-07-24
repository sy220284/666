# M4-02 P0—P4约束包与裁剪追溯

> 状态：Implemented
> 里程碑：M4 检索与AI基础设施
> 优先级：P0
> 工作分支：`work/m4-02-constraint-package`

## 目标

为每类AI任务组装可追溯、符合时序、可裁剪的上下文包。

## 阶段定位

建立FTS、约束包、Provider、Prompt和GenerationRun等可复用AI基础设施。

## 非目标

- 不实现Provider调用。
- 不实现Embedding、Rerank或通用检索Adapter。

## 依赖

M4-01、M3-06

## 关联

- 需求：REQ-025
- 功能ID：AI-003
- 验收：P0-025、P0-026相关Eval

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/database/DATABASE_SCHEMA.md`

## 主要影响范围

- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `packages/prompts/`
- `tests/unit/`
- `tests/integration/`
- `evals/`

## 实施内容

1. 定义P0代码约束、P1章节必须项、P2设定状态、P3文风声音、P4辅助背景。
2. 读取当前章、SceneBeat、前章有效尾快照、EntityState、知情、伏笔、Canon和作品规则。
3. 快照缺失时按DEC-016回退直查并记录snapshotSource。
4. 使用确定性关联与FTS5补充召回，执行时序过滤、去重、冲突标记和来源记录。
5. 估算Token并保留安全边距，按P4→P3→低相关P2裁剪，绝不丢P0/P1。
6. 生成稳定contentHash、constraintHash、来源Version ID和trim log。

## 测试与证据

- 必选项不被裁剪，历史状态不冒充当前，stale快照不进入。
- 相同输入Hash稳定，来源和裁剪结果可复现。
- 超限、冲突、短中文搜索和快照缺失路径。

证据保存到：`docs/test-evidence/M4-02/`

## 实现结果

- 新增P0—P4约束包合同，覆盖任务类型、来源、时序状态、来源Version、Token估算、冲突、裁剪日志、`contentHash`和`constraintHash`。
- Core从ProjectBrief、当前章、SceneBeat、前章有效EndingSnapshot或权威回退、EntityState、KnowledgeState、Foreshadowing、Canon、人物弧光、当前稿与M4-01公共检索组装约束。
- 首章不读取本章尾快照；补充检索按章节顺序排除未来章；Version来源明确标记为`historical`。
- Domain执行稳定序列化、确定性Token估算与P4→P3→低相关P2裁剪；P0/P1不可裁剪，强制约束超限时明确失败。
- Prompt层只负责确定性序列化，不接入Provider，不依赖Renderer临时状态，不新增数据库表。

## 性能与可观测性

- 150万字符正文约束组装与裁剪纳入永久性能回归，完整收口实测P95为107.97ms，低于1000ms预算。
- 每次结果返回实际来源、来源Version、时序状态、Token预算、裁剪日志、冲突清单与稳定Hash，可用于后续GenerationRun和审计追溯。

## 完成条件

- 每次AI任务可追溯实际使用的约束和裁剪结果。
- 约束包不依赖Renderer临时状态。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
