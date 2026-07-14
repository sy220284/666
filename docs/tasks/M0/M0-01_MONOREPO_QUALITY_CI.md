# M0-01 Monorepo、质量工具与CI

> 状态：Planned  
> 里程碑：M0 工程、安全与运行底座  
> 优先级：P0  
> 建议分支：`feat/m0-monorepo-quality-ci`

## 目标

建立可安装、可编译、可测试、可打包的最小仓库骨架，形成所有后续任务可复用的工程入口。

## 阶段定位

应用可安全启动、Core可监管、SQLite/IPC/测试底座可用，关键技术风险有量化结论。

## 非目标

- 不实现业务数据库表。
- 不实现生产Prompt或完整领域模型。
- 不实现真实项目、编辑器或AI功能。

## 依赖

无

## 关联

- 需求：REQ-001
- 功能ID：APP-001
- 验收：P0-001

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/testing/TEST_STRATEGY.md`

## 主要影响范围

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `apps/`
- `packages/`
- `tests/`
- `scripts/`
- `.github/workflows/`

## 实施内容

1. 建立pnpm workspace，正确纳入桌面聚合包、Main、Preload、Renderer和全部packages。
2. 建立Electron Main/Preload/Renderer及contracts/domain/core-service/editor-core/prompts/testkit的可编译入口。
3. 启用TypeScript strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes和useUnknownInCatchVariables。
4. 建立Lint、格式检查、单元测试、集成测试、E2E、构建和打包脚本入口。
5. 建立模块边界静态检查，禁止Renderer、Domain、Contracts越权依赖。
6. 建立CI，执行锁文件安装、lint、typecheck、test、build和边界检查。
7. 恢复并验证本地数据库、工作区、备份、密钥和环境文件的.gitignore规则。

## 测试与证据

- 干净环境执行pnpm install --frozen-lockfile。
- 执行pnpm lint、pnpm typecheck、pnpm test、pnpm build。
- 故意加入一次非法跨层import，确认边界检查失败。
- 确认每个workspace包均被pnpm识别且入口真实存在。

证据保存到：`docs/test-evidence/M0-01/`

## 完成条件

- 根命令全部真实可执行并通过。
- CI与本地命令一致，不存在只在本机成功的隐式步骤。
- 仓库中没有空入口、TODO、固定成功返回或未登记工作区。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
