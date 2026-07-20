# M0-05 测试基建、Fixture与故障注入

> 状态：Verified  
> 里程碑：M0 工程、安全与运行底座  
> 优先级：P0  
> 工作分支：`main`（作者预授权连续主线模式）

## 目标

建立后续任务统一复用的测试项目、Provider Stub、数据库故障、桌面E2E和证据工具。

## 阶段定位

应用可安全启动、Core可监管、SQLite/IPC/测试底座可用，关键技术风险有量化结论。

## 非目标

- 不以测试Fixture代替生产功能。
- 不使用用户私人作品作为Eval或测试数据。

## 依赖

M0-01、M0-02、M0-03、M0-04

## 关联

- 需求：REQ-001、REQ-005、REQ-028
- 功能ID：无
- 验收：P0-001—P0-007、P0-023—P0-024

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/testing/TEST_STRATEGY.md`
- `docs/testing/SECURITY_TEST_CASES.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`

## 主要影响范围

- `packages/testkit/`
- `tests/`
- `evals/`
- `scripts/`
- `docs/test-evidence/`

## 实施内容

1. 建立临时app/project数据库、临时工作区和可注入Clock/ID工厂。
2. 建立Provider Stub：正常流、逐Token、断流、超时、限流、无效JSON、取消。
3. 建立SQLite忙、磁盘不足、事务中断、损坏、Migration中断等故障注入。
4. 建立Electron桌面E2E启动器，而非只测试普通浏览器页面。
5. 建立中文长段落、长章节、百万字搜索和恶意DOCX公开Fixture。
6. 统一测试证据生成格式：命令、退出码、报告、截图、性能和已知风险。

## 测试与证据

- 测试基建自身有自测，确保故障确实被触发。
- 同一Fixture在本地和CI得到稳定结果。
- 测试临时文件、数据库和凭据在结束后清理。

证据保存到：`docs/test-evidence/M0-05/`

## 完成条件

- 后续任务无需重复搭建临时项目、Provider Stub和故障注入。
- 任何测试失败都能定位到可复现Fixture和证据文件。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
