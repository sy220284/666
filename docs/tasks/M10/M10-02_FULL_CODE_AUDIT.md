# M10-02 全量代码测试与深度审计

> 状态：Verified  
> 里程碑：M10 稳定性续作  
> 优先级：P0  
> 实施分支：`work/m10-02-full-code-audit`

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

- 不修改历史Migration、数据库Schema、IPC Channel字符串、协议版本和正式错误码。
- Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。
- AI输出继续先进入建议稿，作者权威状态只能经作者裁决更新。
- Draft Revision、锁定块、自动保存、IME组合输入、只读模式和恢复点语义保持兼容。
- 不降低质量、安全、性能和覆盖率门槛，不扩大覆盖排除，不新增结构债务。

## 4. 审计发现与修复

### 已确认缺陷

设定提取状态原先使用固定`setInterval`读取Generation Run。当前一次IPC超过1秒时，下一轮会继续发起同键请求；Bridge并发控制可能拒绝该请求，调用链又未消费拒绝，形成未处理Promise拒绝。

### 修复

- 新增`startSingleFlightPolling`，仅在本轮Promise完成后调度下一轮。
- 成功、失败与异常均有明确续作策略；终态后停止轮询。
- 组件卸载会取消已调度任务，并阻止完成中的请求继续回写状态。
- 初始Structure与Provider并行读取增加卸载保护。
- 新增慢请求不重叠、拒绝后安全重试、DOM安全边界和零覆盖辅助函数测试。

### 深度审计结论

- P0/P1缺陷：0项。
- P2缺陷：1项，已修复并补测。
- 数据损坏、事务部分提交：未发现。
- IPC越权、Renderer能力面扩大：未发现。
- Schema、协议、错误码、持久化格式漂移：未发现。
- M9拆分新增功能回归：未发现。
- 结构债务：0项。

## 5. 验收结果

- Workspace、边界、格式、Lint、Typecheck：通过。
- 单元、集成、Migration、Coverage：通过。
- Security与Performance：通过。
- Build与Electron E2E 33/33：通过。
- Linux、Windows、macOS Package Smoke：通过。
- Main Verification：通过。
- Coverage：246个测试文件、1063项测试；Statements 85.35%、Branches 75.61%、Functions 85.81%、Lines 87.49%。
- 75%门槛、性能预算和覆盖排除清单均未放宽。

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

最终证据：[`../../test-evidence/M10-02/summary.md`](../../test-evidence/M10-02/summary.md)。

## 7. 实施与关闭检查点

- 最终受检Head：`3da8156bf840cc7f55626ef3b120de2b7aeb5270`。
- 永久门禁：Quality `30787490130`、Security `30787490055`、Performance `30787490030`、Evidence `30787490007`、Task Governance `30787490052`、PR Policy `30787490016`，全部成功。
- 来源PR：#297；Squash合并提交：`ca83d48c7493bba21252a37f9aec024d6aa0ca79`。
- Main Verification：`30788229139`，成功。
- Actions产物：Coverage `8845790348`、Desktop E2E `8846026096`、Linux `8845788810`、Windows `8845793324`、macOS `8845783201`。
- Electron E2E：33/33通过。
- Coverage：246个测试文件、1063项测试通过；Statements 85.35%、Branches 75.61%、Functions 85.81%、Lines 87.49%。

## 8. 回退

按来源PR #297的合并提交整体回退单飞轮询运行时、设定提取轮询改造和新增测试。回退不得单独删除测试而保留异步行为变更，也不得保留固定间隔轮询造成的重叠请求窗口。

## 9. 完成结论

M10-02已完成全量自动验证、源码深度审计、确认缺陷修复、Ready永久门禁、受控合并和main验证，正式关闭为Verified。仓库恢复`VERIFIED_HOLD`，后续开发必须重新立项。
