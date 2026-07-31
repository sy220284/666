# M8-09 WorldForge V1.0 稳定性与生命周期治理

> 状态：Verified  
> 里程碑：M8 长期维护  
> 优先级：P0  
> 正式分支：`work/m8-09-v1-stability-hardening`

## 1. 目标

基于V1.0最终代码审计，修复已由源码确认的数据安全、项目生命周期、启动行为、异步状态隔离、退出流程、错误提示与搜索替换缺陷；保持本地优先、作者裁决、单一权威数据库和既有Candidate/StateProposal安全边界不变。

本任务不扩展云端能力、公开分发、自动更新、数据库Schema或历史Migration。

## 2. 必须闭环的问题

### P0 数据安全

1. 章节切换期间旧编辑器仍可输入，可能丢失加载窗口内新增正文。
2. 新作品正式目录已落盘后，最近作品登记失败可能删除正式作品目录。

### P1 生命周期与功能

3. 最近作品辅助数据库故障不得阻止健康作品创建、打开、移动或恢复。
4. `reopen-last`启动设置必须真实执行，失败时安全降级首页。
5. 跨作品Workspace Attention旧响应不得覆盖新作品状态。
6. 退出流程中的异常必须重置关闭状态并保留安全重试能力。

### P2 健壮性与产品流程

7. 作者可见错误码补齐中文提示，英文技术消息仅进入技术详情和日志。
8. 批量替换表单变化后旧计划必须失效。
9. 搜索索引或词典首次读取失败必须明确提示并允许重试。
10. 项目移动增加安全空间余量，并保留原作品可恢复语义。
11. IPC Main增加统一意外异常边界和诊断ID。
12. Renderer增加`error`与`unhandledrejection`最终诊断边界。

## 3. 架构处理原则

- 先修复真实缺陷并建立失败测试，再提取最小控制器。
- 不在本任务内机械拆分全部巨型TSX或重写CSS体系，避免稳定性修复与高回归重构混合。
- Legacy兼容层、完整组件拆分、CSS责任域重构另行立项，不阻断本任务完成。

## 4. 验收标准

- 章节读取延迟期间编辑器不可继续写入；A→B→C快速切换只挂载最后请求。
- 最近作品登记故障不会删除或关闭已经验证健康的作品。
- 启动行为为`reopen-last`时自动打开最近有效作品；无有效作品或打开失败时显示首页。
- 作品切换后，旧作品状态查询不得回写。
- 任意关闭阶段Promise异常后仍可再次触发安全关闭。
- 67个正式错误码均有确定的作者可见中文语义或受控领域级映射。
- 替换条件变化后无法执行旧计划；初始化读取失败不伪装为空状态。
- 新增单元、集成和必要E2E覆盖上述链路。

## 5. 允许修改范围

- `apps/desktop/main/src/`
- `apps/desktop/preload/src/`
- `apps/desktop/renderer/src/`
- `packages/contracts/src/`
- `packages/core-service/src/`
- `tests/unit/`
- `tests/integration/`
- `tests/e2e/`
- `tests/security/`
- `scripts/`
- `docs/tasks/`
- `docs/product/`
- `docs/testing/`
- `docs/test-evidence/M8-09/`
- `.github/workflows/`

## 6. 禁止范围

- `migrations/`
- 已Verified任务卡和历史Evidence Manifest
- 云存储、云同步、WorldForge自有AI中转服务
- 公开分发、代码签名和自动更新

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

## 8. 实施与验证结果

- 实施提交：`6edb7a7ec7221fd709aba14bc30029acd397f69d`。
- 来源PR：#258；最终Head：`80e68f639ff7547b443cb910883a734ef110508a`。
- 受控main合并提交：`07b5aa8c04628cbac5d74f0cc4139e9609626858`。
- Main Verification Run：`30652873306`，结果成功。
- 来源PR的Quality、Security、Performance、Evidence、PR Policy与Task Governance全部成功。
- Unit、Integration、Migration、Coverage、Electron E2E、Build与Package Smoke全部通过。

## 9. 完成结论

- P0数据安全、P1生命周期与明确P2健壮性问题已完成代码修复和专项回归。
- Evidence已绑定可达main提交与Main Verification Run。
- M8-09已关闭为Verified，仓库恢复最终`VERIFIED_HOLD`。
- 后续巨型组件拆分、CSS责任域与完整原生对话框替换需重新立项，不属于本任务遗留阻断。
