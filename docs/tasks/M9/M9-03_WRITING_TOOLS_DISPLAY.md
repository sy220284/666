# M9-03 WorldForge V1.1 Writing工具与展示拆分

> 状态：In Progress
> 里程碑：M9 V1.1架构治理
> 对应工作包：AR-03
> 优先级：P0
> 正式分支：`work/m9-03-writing-tools-display`

## 1. 目标

从`writing-core-workbench.tsx`先提取低风险纯工具、查找替换、Version、Candidate审阅与Generation展示组件，缩小Writing组合根，同时保持章节会话、自动保存、IME、Editor挂载和Bridge时序不变。

## 2. 必须实施

1. 提取`paste-sanitizer.ts`。
2. 提取`editor-selection.ts`。
3. 提取`continuation-anchor.ts`。
4. 提取`find-replace-toolbar.tsx`。
5. 提取`version-panel.tsx`。
6. 提取`historical-navigation-notice.tsx`。
7. 提取`candidate-review-panel.tsx`。
8. 提取`candidate-conflicts.ts`。
9. 提取`candidate-selection.ts`。
10. 将Generation表单、运行状态、候选预览和融合展示拆为职责单一的子组件。
11. `WritingWorkbench`继续作为公开入口，现有Props、中文文案、`data-*`测试标记和Bridge调用顺序保持兼容。
12. 将依赖源码位置的测试迁移到新职责文件，并补充纯工具和展示边界回归测试。

## 3. 不可破坏的不变量

- 不修改自动保存、切章、Editor创建/销毁、IME组合、续写位置保存和刷新前Flush顺序；这些生命周期属于M9-04。
- 不修改数据库Schema、历史Migration、IPC Channel、协议版本、错误码或公开Bridge方法。
- Candidate仍只能预览后采用；冲突、锁定块、撤销和Skeleton审阅语义不变。
- Version创建、定稿、恢复为新稿、导出和历史定位语义不变。
- AI输出仍只进入Candidate，作者确认前不得写入当前稿。
- 不修改Core Service、Main、Preload或Contracts业务逻辑。

## 4. 职责与结构预算

- `writing-core-workbench.tsx`仅保留Writing组合、章节会话和M9-04待处理的生命周期逻辑，本任务不得增加其行数。
- 新普通React Panel不超过400行，Hook或Controller不超过300行，纯工具模块不超过250行，任何非生成源码不得超过1000行。
- `writing-core-workbench.tsx`现有超限债务继续归属AR-03/AR-04；本任务完成后必须显著下降，并由M9-04完成300行组合根目标。
- 不登记新的结构债务、Feature反向依赖或循环依赖例外。

## 5. 允许修改范围

- `apps/desktop/renderer/src/features/writing/`
- `tests/unit/`
- `tests/integration/`
- `tests/e2e/`
- `tests/security/`
- `tests/performance/`
- `docs/architecture/`
- `docs/tasks/`
- `scripts/`
- `.github/workflows/`

## 6. 禁止范围

- `apps/desktop/main/src/`
- `apps/desktop/preload/src/`
- `packages/contracts/src/`
- `packages/core-service/src/`
- `packages/domain/src/`
- `packages/editor-core/src/`
- `packages/prompts/src/`
- `migrations/`
- 历史Evidence目录

## 7. 验收标准

- 冻结工作包列出的纯工具与展示模块全部独立落盘，职责边界可由测试验证。
- Candidate预览、采用、撤销、冲突、锁定块和Skeleton审阅行为一致。
- Version创建、定稿、恢复为新稿、导出和历史定位行为一致。
- 粘贴清理、编辑器选择和续写锚点纯函数拥有直接单元测试。
- 原Writing专项Unit、Integration、Security、Performance和Electron E2E全部通过。
- 源码结构扫描无新增债务，永久门禁全部成功。

## 8. 验证矩阵

```text
pnpm task:validate
pnpm check:workspaces
pnpm check:boundaries
pnpm check:language
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm build
pnpm test:e2e
pnpm release:check
```

## 9. 回退

- 本任务不改变持久化格式，可通过单次Revert恢复原Writing组合实现。
- 若提取导致自动保存、切章、IME、Candidate或Version行为变化，立即回滚本工作包，不跨入M9-04追补。

## 10. 完成条件

- 独立PR永久门禁成功。
- 低风险工具与展示职责完成拆分，章节会话控制逻辑保持原位。
- 合并后main验证成功，再通过独立治理关闭为Verified。
