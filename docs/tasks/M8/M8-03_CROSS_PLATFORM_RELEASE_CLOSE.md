# M8-03 跨平台构建、P0追踪与发布关闭

> 状态：Planned  
> 里程碑：M8 发布硬化与验收  
> 优先级：P0  
> 建议分支：`work/m8-03-cross-platform-release-acceptance`

## 目标

完成Windows、macOS、Linux构建验证、P0追踪关闭、文档同步和最终发布判断。

## 阶段定位

完成安全、数据、性能、E2E、跨平台构建、P0追踪和发布关闭。

## 非目标

- 不在发布关闭任务新增产品功能。
- 不在发现功能或架构缺陷后直接扩大本任务范围；必须建立独立修复任务并阻断发布关闭。

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

- `.github/workflows/`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `apps/desktop/`中的构建与打包配置
- `scripts/`中的构建、发布和验证脚本
- `docs/`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `docs/test-evidence/M8-03/`

若仓库实际打包配置位于其他明确路径，任务启动基线审计必须列出并加入ACTIVE_TASK授权；禁止使用“构建与发布配置”等非路径占位词。

## 发布输入锁定

M8-03启动时记录并锁定：

- main提交SHA；
- M8-01/M8-02证据Head；
- 各平台构建配置版本；
- Node、pnpm、Electron和原生模块版本；
- P0矩阵与追踪矩阵版本。

任务执行中若main业务代码变化，原构建和验收证据自动失效，必须重新运行受影响矩阵。

## 实施内容

1. 验证Windows安装、启动、升级、卸载和原生模块匹配。
2. 记录macOS构建、签名、公证流程和权限提示；无法在当前环境真实签名时明确Blocked，不用文档模拟成功。
3. 验证Linux目标包、桌面集成和Credential Store不可用时安全降级。
4. 验证更新安装不破坏已有项目、凭据引用、最近项目、备份和Migration。
5. 执行自主写作、专业空白、AI闭环、状态提案、搜索替换、导入导出、备份恢复全业务验收。
6. 将追踪矩阵全部P0需求标记Verified或明确Blocked；基础任务已Verified不能替代后续产品与发布链路证据。
7. README、快速开始、已知限制、备份恢复指南、发布检查和变更记录与实现一致。
8. 输出允许发布、有条件允许或禁止发布结论；任一数据安全、恢复或代码硬保证失败必须为禁止发布。
9. 发现局部构建配置缺陷可在本任务明确路径中修复并重跑；产品功能、数据模型或架构缺陷转独立任务。
10. 清理临时工具PR、无效构建产物引用和过期发布文档，但不得删除历史可复核证据。

## 测试与证据

- 跨平台构建产物、校验和、安装/升级/卸载记录。
- 原生模块ABI、Credential Store、安全降级和项目兼容记录。
- 全部P0证据可追溯到任务、提交、命令和人工验收。
- main SHA与证据Head一致性检查。
- 发布结论列出阻断、风险、已知限制和责任任务。
- 任何无法在真实平台执行的项目明确标记Blocked或条件限制，不伪造通过。

证据保存到：`docs/test-evidence/M8-03/`

## 完成条件

- Windows、macOS、Linux均有真实构建或明确可审计的Blocked结论。
- 不只写“测试通过”，所有结论均有证据并绑定锁定提交。
- P0-001—P0-075全部Verified或明确Blocked，状态与追踪矩阵一致。
- V1.5仍保持独立延期，不混入V1.0发布。
- 发布判断可由第三方依据证据复核。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
