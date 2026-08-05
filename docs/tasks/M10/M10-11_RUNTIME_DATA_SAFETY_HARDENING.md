# M10-11 运行时、恢复与异步安全硬化

> 状态：In Progress  
> 里程碑：M10 稳定性与治理续作  
> 优先级：P0  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`b77d67629006a0b94f3ad51146f3f95a90780e82`

## 目标

根据最新全量代码与功能审计，关闭 Provider DNS 校验与真实连接未绑定、恢复系统跨文件与数据库请求重放不闭环、快速切章后旧 Generation Sources 回写、跨平台文件名组件超限、正文保存后续写位置失败无反馈，以及 Renderer 关键异步 Hook 缺少行为测试的问题。

本任务以数据安全和作者可见闭环为主线，将相关修复集中在同一个受检 `work → main` PR，避免网络安全、恢复一致性、Renderer 竞态和测试治理分别形成互相等待的多套状态。

## 阶段定位

本任务属于发布前运行时安全与数据一致性硬化。它修复已核实的跨层缺陷，不扩展产品功能，不引入云能力，不改变 Candidate、Draft、Version 或作者裁决权模型。

## 依赖

- M10-10 已通过 `task-verification/M10-10=success`；
- 当前 `main` 已通过 `main-verification=success`；
- 实施开始时 `main == work == b77d67629006a0b94f3ad51146f3f95a90780e82`。

## 真实承接基线

### 已确认缺陷

1. Provider 端点检查阶段解析并审计 DNS，但正式连接继续由普通 `fetch` 重新解析主机名，存在校验地址与实际连接地址分离窗口。
2. 备份创建在数据库 `requestId` 幂等前产生正式文件；恢复副本与空间清理也没有完整的整命令重放闭环。
3. `useGenerationSources` 没有请求代次、取消或 Effect 清理，旧章节请求可覆盖新章节 SceneBeat 与映射模式。
4. 导出和恢复路径按字符截断，未对完整文件名、临时后缀和 UTF-8 字节预算进行统一控制。
5. Draft Patch 成功后忽略 `saveContinuation()` 失败结果，界面仍显示完整保存成功。
6. Renderer TSX 覆盖率门禁只冻结未覆盖数量，关键异步 Hook 缺少可执行行为测试。

### 本任务不处理

- Safe Replace 失败后统一将计划标记为 stale：当前属于冻结的保守安全策略，不按缺陷修改。
- 旧备份元数据规范化失败静默降级：记录仍可恢复，本任务只在触及同一模块时保留现有兼容行为。
- 全量提升所有 Renderer TSX 的覆盖百分比：本任务只为受影响关键 Hook 建立真实行为测试和回归入口。

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/TASK_AUTHORIZATION.json`
- `docs/tasks/TASK_INDEX.md`
- `docs/tasks/M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md`
- `docs/tasks/M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md`
- `docs/tasks/M10/M10-01_ASYNC_LIFECYCLE_HARDENING.md`
- `docs/tasks/M10/M10-08_CODE_QUALITY_GOVERNANCE.md`
- `docs/security/THREAT_MODEL.md`
- `docs/architecture/CODE_QUALITY_GOVERNANCE.md`

## 主要影响范围

- `packages/core-service/src/provider-*.ts`
- `packages/core-service/src/utility-generation-router.ts`
- `packages/core-service/src/recovery/`
- `packages/core-service/src/checkpoint-aware-recovery.ts`
- `apps/desktop/renderer/src/features/writing/`
- `tests/security/`
- `tests/integration/`
- `tests/unit/`
- `vitest.coverage.config.ts`
- 本任务卡、Runtime、任务索引与 Evidence

## 职责、状态所有权与依赖方向

### Provider 网络绑定

- `provider-endpoint.ts` 负责 URL、DNS 和网络信任边界判定；
- 新的受控传输层只消费已验证地址集合，不自行放宽信任范围；
- HTTP Host 与 HTTPS SNI 始终保留原始主机名；
- 实际 Socket 连接只能使用本次校验返回的地址；
- 连接测试与正式生成共享同一绑定路径；
- 自定义测试 `fetch` 依赖继续允许注入，生产默认路径必须执行绑定。

### Recovery 跨存储一致性

- `requestId` 是整条恢复命令的幂等身份；
- 备份文件、元数据和 `backup_records` 必须具备可重放、可补偿、可验证的单一闭环；
- 重复请求返回首次成功结果，不创建第二份正式备份；
- 正式文件改名、数据库登记或元数据写入任一步失败时清理本次可识别副作用；
- 恢复副本重放能识别同一请求已经完成的目标；
- 清理重放不会因目标已删除而将首次成功改报失败。

### Renderer 异步状态

- Generation Sources 只允许当前 project/chapter 请求代次写入状态；
- 切章或卸载会取消等待并清空章节专属来源；
- Provider 列表共享请求不得使章节 SceneBeat 请求整体失败；
- 正文和续写位置保存结果分别可见，正文成功不能掩盖位置失败。

## 数据库与 Migration

优先复用现有 `backup_records`、备份元数据和确定性请求身份完成幂等闭环。若真实实现无法在不增加持久化状态的前提下保证崩溃重放，必须追加向前兼容 Migration，并补逐级升级、重复执行和恢复测试。禁止修改已发布 Migration。

## IPC、事件与错误码

- 不增加宽泛 IPC 能力；
- 现有 Provider 与 Recovery 命令 Schema 保持严格；
- 能使用现有稳定错误码时不新增错误码；
- 续写位置失败通过现有 Renderer 状态文案呈现，不泄露正文或内部路径。

## UI 闭环

- 切章后不得展示旧章节 SceneBeat；
- Provider 或 SceneBeat 单项失败不得错误覆盖另一项已成功数据；
- 正文保存成功而续写位置失败时，状态明确显示“正文已保存，续写位置待重试”；
- 不新增无功能入口或第二套保存状态。

## 安全、隐私与恢复

- Provider DNS 绑定必须覆盖连接测试与全部正式生成模式；
- 禁止通过重定向、二次 DNS 解析或混合地址族跨越已批准信任边界；
- TLS 证书仍按原主机名验证；
- 请求和响应正文不进入普通日志；
- 备份与恢复失败不遗留可被误识别为有效恢复点的正式文件；
- 恢复始终创建新副本，不覆盖当前项目。

## 文件名与路径预算

- 统一以 UTF-8 字节数计算路径组件预算；
- 最终文件名、恢复目录名和临时文件名均不得超过保守组件预算；
- 截断后附加稳定短 Hash，降低长标题碰撞；
- 保留扩展名、恢复标识和用户可识别前缀；
- 正常恢复与 checkpoint-aware recovery 复用同一实现。

## 自动化测试

1. DNS 校验地址与真实连接绑定，Host 与 TLS SNI 使用原主机名；
2. DNS 在校验后变化时，连接仍只使用已验证地址；
3. 混合信任边界、重定向、保留地址和响应上限保持拒绝；
4. 同一备份 `requestId` 重放只产生一条数据库记录和一组正式文件；
5. 正式 SQLite 已改名、元数据改名失败时无孤儿正式文件；
6. 恢复副本与清理命令重放返回稳定成功结果；
7. 快速切章时旧请求晚返回不会覆盖当前章节；
8. SceneBeat 与 Provider 单项失败互不吞掉已成功结果；
9. 中文长标题导出、恢复目录和临时文件均满足字节预算；
10. 正文成功、续写位置失败时返回失败并显示可重试状态；
11. 受影响 Hook 进入真实执行覆盖，不再只靠源码字符串断言。

## 验证命令

- `pnpm task:validate`
- `pnpm check:language`
- `pnpm check:workspaces`
- `pnpm check:boundaries`
- `pnpm format:check`
- `pnpm lint`
- `pnpm ci:policy`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:migration`
- `pnpm test:coverage`
- `pnpm test:security`
- `pnpm test:perf`
- `pnpm build`
- `pnpm test:e2e`

## Evidence

保存到：`docs/test-evidence/M10-11/`

## 回滚策略

按单一任务回退 Provider 绑定传输、Recovery 幂等与补偿、Renderer 请求代次、路径预算和对应测试。回滚不得恢复已确认的 DNS 重绑定窗口、跨存储孤儿文件或旧章节回写行为。

若某一局部修复需要回退，必须保留其余已通过安全边界，并记录独立最小复现和后续阻断任务，禁止整体降级为普通 `fetch`、随机文件身份或无代次异步写回。

## 完成条件

- Provider 已验证地址与真实连接绑定，原主机名 TLS 验证保持；
- Recovery 创建、恢复和清理对同一 `requestId` 可安全重放；
- 跨文件与数据库失败路径具备完整补偿；
- Generation Sources 不再跨章节回写；
- 文件名与临时路径满足 UTF-8 字节预算；
- 正文保存与续写位置保存结果不再互相掩盖；
- 关键 Renderer Hook 具备真实行为测试；
- 全量永久门禁通过并形成 M10-11 Evidence；
- 合并后 `main-verification` 与 `task-verification/M10-11` 成功；
- `work` 受控同步到最新 `main`。
