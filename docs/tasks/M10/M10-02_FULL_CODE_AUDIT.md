# M10-02 全量代码测试与深度审计

> 状态：In Progress  
> 里程碑：M10 稳定性续作  
> 优先级：P0  
> 分支：`work/m10-02-full-code-audit`

## 1. 目标

以`main@122ac7b753faae0c85d39f8efc58cd3245685e0b`为冻结基线，对当前全仓代码执行完整自动验证和源码级深度审计，核实M9拆分及M10-01硬化后的功能、事务、协议、安全、性能和跨平台行为。发现真实问题时，在本任务内完成最小修复、补充回归测试并重新执行完整矩阵。

## 2. 审计范围

1. Workspace、依赖边界、循环依赖、结构预算和公开入口。
2. Renderer生命周期、编辑器、自动保存、章节切换、Candidate和导航守卫。
3. Preload Bridge、Task MessagePort、Main IPC注册与释放、来源和Schema校验。
4. Core Service事务、Draft、Version、Recovery、Import/Export、Search与安全替换。
5. Project Workspace路径、移动、恢复、只读和单活动项目约束。
6. AI Generation、State Proposal、Canon、Planning及作者裁决边界。
7. Migration兼容、错误码、协议版本、持久化格式和历史数据不变量。
8. Security、Performance、Coverage、Build、Electron E2E及三平台Package Smoke。
9. 死代码、空实现、异常吞噬、竞态、资源泄漏、越权能力和测试盲区。

## 3. 行为不变量

- 不修改历史Migration、数据库Schema、IPC Channel字符串、协议版本和正式错误码，除非审计证明存在必须修复的阻断问题并单独登记兼容方案。
- Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。
- AI输出继续先进入建议稿，作者权威状态只能经作者裁决更新。
- Draft Revision、锁定块、自动保存、IME组合输入、只读模式和恢复点语义保持兼容。
- 不降低质量、安全、性能和覆盖率门槛，不扩大覆盖排除，不新增结构债务。

## 4. 允许路径

- `apps/`
- `packages/`
- `tests/`
- `scripts/`
- `.github/`
- `docs/tasks/M10/`
- `docs/tasks/runtime/M10-02.json`
- `docs/test-evidence/M10-02/`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `package.json`
- `pnpm-lock.yaml`

## 5. 禁止路径

- `migrations/`
- `docs/test-evidence/M0/`
- `docs/test-evidence/M1/`
- `docs/test-evidence/M2/`
- `docs/test-evidence/M3/`
- `docs/test-evidence/M4-04/`
- `docs/test-evidence/M8-02/`
- `docs/test-evidence/M8-04/`
- `docs/test-evidence/M8-05/`
- `docs/test-evidence/M8-06/`
- `docs/test-evidence/M8-07/`
- `docs/test-evidence/M8-08/`
- `docs/test-evidence/M8-09/`
- `docs/test-evidence/M9-00/`
- `docs/test-evidence/M9-02/`
- `docs/test-evidence/M9-03/`
- `docs/test-evidence/M10-01/`

## 6. 验证矩阵

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
Linux / Windows / macOS Package Smoke
```

## 7. 完成定义

- 完整矩阵基于同一最终Head全部成功。
- 深度审计按功能域给出可复核结论，区分新增问题、历史问题、潜在风险和证据不足项。
- 所有确认问题完成修复、回归测试和复跑，或明确记录阻断原因与回退边界。
- 结果写入`docs/test-evidence/M10-02/`，任务关闭为Verified后仓库恢复`VERIFIED_HOLD`。
