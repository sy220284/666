# M8-09 V1.0稳定性与数据安全治理

> 状态：In Progress  
> 里程碑：M8 长期维护  
> 优先级：P0  
> 正式分支：`work/m8-09-v1-stability-remediation`

## 目标

修复V1.0代码级复核确认的数据安全、项目生命周期、启动行为、跨作品异步状态、退出恢复、作者错误提示、搜索替换一致性和跨进程异常边界问题。保持数据库Schema、作品格式、AI建议稿边界和本地优先架构不变。

## 必须闭环

1. 章节切换期间旧编辑器不可继续产生未绑定到权威章节的新输入；章节与当前稿在读取成功后原子切换。
2. 最近作品辅助数据库失败不得删除、关闭或回滚已经创建、打开、移动或恢复成功的权威作品目录。
3. `reopen-last`启动设置必须真实执行，并在路径失效或打开失败时安全回到首页。
4. 跨作品工作区状态请求不得把旧作品结果回写到新作品。
5. 退出流程任意异常后必须可重试，不得永久锁死关闭。
6. 正式错误码必须获得中文作者语义；英文技术消息不得进入作者主提示。
7. 批量替换条件变化必须使旧预览失效；搜索初始化失败必须明确显示。
8. Main IPC与Renderer异步异常必须进入统一结构化兜底。

## 非目标

- 不修改Migration或作品数据库Schema。
- 不新增云服务、账号、同步、模型托管或生产依赖。
- 不在稳定性PR中机械拆分巨型组件、重写CSS体系或扩展新的作品检查数据模型。
- 原生对话框整体替换、工作台大型职责拆分和当前稿快速检查作为V1.1维护改造，不阻塞本次V1.0数据安全修复。

## 主要影响范围

- `apps/desktop/renderer/src/`
- `apps/desktop/main/src/`
- `packages/core-service/src/`
- `packages/contracts/src/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`
- `docs/tasks/`
- `docs/product/`
- `docs/testing/`
- `docs/test-evidence/M8-09/`
- `CHANGELOG.md`

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/TASK_AUTHORIZATION.json`
- `docs/tasks/runtime/M8-08.json`
- `docs/tasks/TASK_INDEX.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`
- `docs/process/CI_PARALLEL_TOOLCHAIN_MULTITASK.md`

## 验证命令

- `pnpm check:language`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:migration`
- `pnpm test:coverage`
- `pnpm test:security`
- `pnpm test:perf`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm release:check`

## 验收

- P0章节切换和作品目录提交边界具有失败回归测试。
- 最近作品记录故障不再改变权威作品生命周期结果。
- 启动自动重开、跨作品异步隔离和退出重试均可重复验证。
- 所有正式错误码都有作者可理解的中文提示。
- 全部永久质量门通过后才能转为Implemented。
