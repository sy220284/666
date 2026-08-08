# M10-20 全量审计问题修复与发布链路收口

> 状态：Implemented
> 里程碑：M10 稳定性与治理续作
> 优先级：P1
> 执行分支：work
> 目标分支：main

## 目标

修复 M10-19 合并后全仓深度审计确认的依赖发布阻断、Provider 非幂等请求重放、历史 Evidence 全量扫描、Foundation 打包入口及 Renderer TSX 测试薄弱问题，使产品运行链、治理链和发布链恢复一致。

## 阶段定位

本任务是已验证 V1.0 主线上的缺陷治理任务，不扩展产品功能。保留现有 SQLite、Core 单写、IPC、Candidate、Version、Recovery 与 Renderer 状态所有权，只修复审计暴露的公共边界和验证缺口。

## 非目标

- 不新增产品功能、Provider 协议或云服务。
- 不修改数据库 Schema、Migration、IPC protocolVersion 或 Credential 模型。
- 不重写现有 Provider 适配器、桌面打包器或 Renderer 架构。
- 不降低依赖审计、Evidence、Coverage 或发布门槛。

## 依赖

- M10-19 已通过 `task-verification/M10-19` 和当前主线 `main-verification`。
- `work` 与 `main` 均以 `7c5be0404c57f291802eeee675865f50ed4e9d3c` 为启动基线。
- 当前不存在第二个开放的 `work → main` PR。

## 真实承接基线

全仓审计已真实运行 Unit、Integration、Migration、Security、Performance、Coverage、Build、Linux Package 与 Electron E2E。确认五类问题：高危开发依赖阻断发布、非幂等 POST 在多地址间重放、M10-03/M9-01 历史 Evidence 扫描失败、Foundation 导入失效、Renderer TSX 交互覆盖不足。

## 关联

- 需求：作者要求修复、优化并完善全量审计发现。
- 功能ID：治理与发布质量，不新增产品功能ID。
- 验收：五类问题均有根因修复与回归；完整验证真实执行；失败、跳过和环境边界如实记录。

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/architecture/CODE_QUALITY_GOVERNANCE.md`
- `docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md`
- `docs/security/THREAT_MODEL.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/process/RELEASE_QUALIFICATION.md`

## 主要影响范围

- Provider 固定地址传输及 Security 回归。
- workspace 自动发现与 Foundation manifest 打包。
- Verified Evidence 全量扫描及历史缺失 Evidence 补录。
- 根开发依赖锁文件与发布审计。
- Renderer 无 Hook 展示组件、交互回调测试及 TSX Coverage 基线。

## 职责、状态所有权与依赖方向

- Provider 地址选择继续由 Core 传输层单点负责；只在连接尚未建立、请求不可能送达时切换地址，禁止对可能已送达的非幂等请求重放。
- Foundation 只消费 workspace 自动发现结果，不恢复第二份静态目录真源。
- Evidence Scanner 继续验证文件完整性、最终语义和提交祖先关系；仅对旧 Schema 1 Evidence 的 squash orphan commit 使用 Runtime 来源 PR 对应受控主线提交作兼容绑定。
- Renderer 生产状态和组件结构不改，通过真实作者可见输出与回调行为补测试。

## 数据库与Migration

不修改数据库与 Migration。

## IPC、事件与错误码

不修改 IPC、事件或错误码。Provider 连接失败继续返回原始受控错误；仅收紧地址故障转移语义。

## UI闭环

覆盖上下文帮助、安全提示、任务条、规划错误、写作页头、查找替换、建议稿骨架等无 Hook 或服务端可渲染组件的主要显示分支和交互回调，不引入平行 UI 状态。

## 安全、隐私与恢复

- Provider 请求仍保持 DNS 固定、Host/SNI 保留和跨 Origin 拒绝。
- 非幂等请求一旦连接建立即 fail-closed，不自动转发到第二地址。
- 依赖升级仅修复开发工具链漏洞，不进入生产依赖。
- 历史 Evidence 补录只引用已有受控主线提交和原永久工作流运行，不伪造历史执行。

## 性能预算

不增加运行时轮询、磁盘扫描或网络请求；Provider 仅增加常量级连接阶段状态判断。新增测试只影响 CI。

## 实施内容

1. 更新漏洞依赖解析并保持锁文件可复现。
2. 为 Provider 多地址故障转移建立“连接前可切换、连接后非幂等不重放”规则。
3. 修复 Foundation 对已移除 workspace 静态导出的依赖。
4. 为历史 Schema 1 squash Evidence 建立通用兼容绑定，并补录 M9-01 缺失 Evidence。
5. 增加 Renderer 关键展示与交互测试，使用真实改善后的覆盖结果收紧 TSX 基线。

## 自动化测试

```text
pnpm task:validate
pnpm check:language
pnpm check:workspaces
pnpm check:boundaries
pnpm format:check
pnpm lint
pnpm ci:policy
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm build
pnpm package:foundation
pnpm audit --audit-level=high
node scripts/verified-evidence-scan.mjs
pnpm test:e2e
```

## 人工验收

- 复现 Provider 首地址收包后断连，确认第二地址不再收到同一 POST。
- 复现首地址未建立连接，确认仍可安全切换到下一地址。
- 检查 Foundation manifest 只包含自动发现且 `policy.buildable=true` 的 workspace，并排除非 buildable 聚合 workspace `apps/desktop`。
- 检查 M9-01 补录明确标注追溯来源，M10-03 原 Evidence 文件未被修改。

## Evidence

保存到：`docs/test-evidence/M10-20/`

历史规则冲突处理：已 Verified Evidence 原则上冻结；本任务不修改 M10-03 原 Evidence，只在 Scanner 增加通用 squash 兼容。M9-01 原本不存在 Evidence 包，采用新增补缺方式，并明确记录其历史受控主线提交与原工作流运行，避免改写任何既有历史文件。

## 回滚策略

整体回退 M10-20 的依赖锁、Provider 连接阶段规则、Foundation 入口、Evidence Scanner、M9-01 补录和 Renderer 测试/基线；不回退或改写任何数据库、Migration、历史产品任务实现。

## 完成条件

- [x] `pnpm audit --audit-level=high` 通过。
- [x] Provider 非幂等 POST 不在可能已送达后自动重放，连接前地址故障转移仍可用。
- [x] `node scripts/verified-evidence-scan.mjs` 全量治理路径已修复并由专项测试覆盖。
- [x] `pnpm package:foundation` 的动态 workspace 入口已修复并由集成/三平台 Package Smoke 覆盖。
- [x] Renderer 关键组件交互测试真实通过，TSX 四项覆盖均改善并收紧基线。
- [x] Ready 完整验证矩阵真实执行并全绿。
- [x] Runtime、TASK_INDEX 与 Evidence 已进入最终收口。
- [ ] Controlled Merge、Main Verification 与 Work Synchronization 完成。
