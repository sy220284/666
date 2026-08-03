# M10-01 异步生命周期与竞态硬化

> 状态：In Progress  
> 里程碑：M10 稳定性续作  
> 优先级：P1  
> 分支：`work/m10-01-async-lifecycle-hardening`

## 1. 目标

修复M9全量审计发现的章节切换编辑器锁死问题，加固Task事件序号缺口恢复，以可执行测试收窄Renderer异步生命周期盲区，并移除被官方明确标记为broken的pnpm 11.13.0。

## 2. 实施范围

1. 章节加载期间允许最新章节请求替代旧请求，不重复执行Draft Flush。
2. Flush或读取失败时恢复当前编辑器可编辑状态，并使旧请求确定性失效。
3. Task快照恢复期间若继续收到缺口事件，首轮恢复完成后再次读取快照，禁止ACK后永久遗漏末尾状态。
4. 增加章节状态策略、源码不变量、Task恢复交错和候选加载分支测试。
5. 提高分支覆盖余量；不降低现有75%门槛，不扩大覆盖排除。
6. 将根工程、永久Actions工作流和离线工具链中的pnpm统一从11.13.0升级至11.13.1。

## 3. 行为不变量

- 不修改数据库Schema、Migration、IPC Channel、协议版本、错误码和公开Bridge签名。
- 不改变Draft Revision、自动保存、IME组合输入和只读模式语义。
- Task事件继续校验Envelope、发送ACK、抑制重复事件并按项目隔离。
- pnpm升级仅修复工具版本，不改变依赖解析结果和业务依赖版本。
- 不允许新增循环依赖、结构债务或Coverage排除。

## 4. 允许路径

- `apps/desktop/renderer/src/features/writing/`
- `apps/desktop/preload/src/`
- `tests/unit/`
- `docs/tasks/M10/`
- `docs/tasks/runtime/M10-01.json`
- `docs/test-evidence/M10-01/`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `package.json`
- `.github/workflows/`
- `.github/governance/toolchain-bundle.mjs`

## 5. 禁止路径

- `migrations/`
- `packages/contracts/src/`
- `packages/core-service/src/`
- `packages/domain/src/`
- `packages/editor-core/src/`
- `packages/prompts/src/`
- 历史Evidence目录

## 6. 验收标准

- 连续切章不会触发并发Flush；加载中的旧请求可被新请求替代。
- Flush失败后当前编辑器恢复至符合只读状态的可编辑性。
- Task缺口恢复期间新增缺口会触发后续快照恢复。
- 新增交错测试、现有单元测试、覆盖率、类型检查、构建和Electron E2E全部通过。
- 覆盖率门槛保持不变，Renderer覆盖排除清单不得扩大。
- 全仓不再存在执行用pnpm 11.13.0配置，Actions日志不再出现broken版本警告。

## 7. 验证矩阵

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

## 8. 回退

按本任务提交整体回退章节状态策略、Task恢复协调器、专项测试和pnpm版本同步。回退不得单独删除测试而保留异步行为变更，也不得只回退部分工作流导致工具链版本分裂。
