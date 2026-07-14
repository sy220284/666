# M8-03 跨平台构建、P0追踪与发布关闭

> 状态：Planned  
> 里程碑：M8 发布硬化与验收  
> 优先级：P0  
> 建议分支：`release/m8-v1-acceptance`

## 目标

完成Windows、macOS、Linux构建验证、P0追踪关闭、文档同步和最终发布判断。

## 阶段定位

完成安全、数据、性能、E2E、跨平台构建、P0追踪和发布关闭。

## 非目标

- 不在发布关闭任务新增产品功能。

## 依赖

M8-01、M8-02

## 关联

- 需求：全部V1.0需求
- 功能ID：全部V1.0功能
- 验收：P0-001—P0-075

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`
- `docs/tasks/ACTIVE_TASK.md`

## 主要影响范围

- `构建与发布配置`
- `docs/`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `docs/test-evidence/M8-03/`

## 实施内容

1. 验证Windows安装/启动/卸载和原生模块匹配。
2. 记录macOS构建、签名/公证流程和权限提示。
3. 验证Linux目标包及Credential Store不可用时安全降级。
4. 验证更新安装不破坏已有项目。
5. 执行自主写作、专业空白、AI闭环、状态提案、搜索替换、导入导出、备份恢复全业务验收。
6. 将追踪矩阵全部P0需求标记Verified或明确Blocked。
7. README、快速开始、已知限制、备份恢复指南、发布检查和变更记录与实现一致。
8. 输出允许发布/有条件允许/禁止发布结论。

## 测试与证据

- 跨平台构建产物和安装记录。
- 全部P0证据可追溯到任务、命令和人工验收。
- 发布结论列出阻断、风险和已知限制。

证据保存到：`docs/test-evidence/M8-03/`

## 完成条件

- 不只写“测试通过”，所有结论均有证据。
- V1.5仍保持独立延期，不混入V1.0发布。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
