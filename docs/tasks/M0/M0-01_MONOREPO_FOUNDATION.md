# M0-01 Monorepo与质量工具

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m0-monorepo-foundation`

## 目标

建立可安装、可构建、可测试的最小工程，为后续Electron、数据库、编辑器和AI功能提供统一底座。

## 非目标

- 不实现业务页面。
- 不实现项目数据库业务表。
- 不接入真实Provider。
- 不实现编辑器和AI流程。

## 依赖

无。

## 关联

- 需求：REQ-001
- 功能：APP-001
- 验收：P0-001

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/testing/TEST_STRATEGY.md`

## 允许修改

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
.eslintrc / eslint.config.*
.prettier*
vitest.config.*
playwright.config.*
apps/
packages/
tests/
scripts/
.github/workflows/（仅基础CI）
docs/test-evidence/M0-01/
```

## 实施内容

1. 初始化pnpm workspace。
2. 创建：
   - `apps/desktop/main`
   - `apps/desktop/preload`
   - `apps/desktop/renderer`
   - `packages/contracts`
   - `packages/domain`
   - `packages/core-service`
   - `packages/editor-core`
   - `packages/prompts`
   - `packages/testkit`
3. 启用TypeScript strict。
4. 配置ESLint、Prettier、Vitest和Playwright。
5. 建立根脚本：
   - `dev`
   - `build`
   - `lint`
   - `typecheck`
   - `test`
   - `test:integration`
   - `test:e2e`
   - `test:security`
   - `test:migration`
   - `test:perf`
   - `test:eval`
6. 创建最小Electron窗口和空白Core启动占位，但不得伪装成业务完成。
7. 添加包边界静态检查。
8. 建立基础CI：安装、lint、typecheck、test、build。

## 测试

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 完成条件

- 所有命令真实通过。
- 包依赖方向符合`MODULE_BOUNDARIES.md`。
- 无生产业务Mock冒充完成。
- CI可在干净环境执行。
- 证据保存到`docs/test-evidence/M0-01/`。
- 追踪矩阵更新为Verified后才关闭任务。
