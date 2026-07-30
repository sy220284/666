# M8-06 发布资格与任务治理硬化

> 状态：In Progress  
> 里程碑：M8 长期维护  
> 优先级：P0  
> 正式分支：`work/m8-06-release-qualification-governance`

## 目标

移除发布工具对固定任务`M8-02`的依赖，使发布资格由当前完整任务状态、最终验证保持、延期验证账本和受检提交可达性共同决定，阻止“早期发布任务已Verified、后续维护任务仍未完成”时错误放行发布。

## 缺陷基线

1. `scripts/release-tool.mjs`将`M8-02`硬编码为唯一发布任务，只检查该任务是否为Verified。
2. 当前任务体系允许在M8-02之后继续增加M8-04、M8-05等独立维护任务；固定任务检查无法感知后续任务处于Planned、In Progress或Implemented。
3. 发布门没有检查`ACTIVE_TASK.json`是否处于最终`VERIFIED_HOLD`、`deferredVerification`是否为空、最终任务与`lastVerifiedTask`是否一致。
4. 发布门没有确认最终受检提交和Evidence提交是否为当前发布提交的可达祖先。

## 实施范围

### 1. 动态发布资格

- 读取`TASK_INDEX.md`和`ACTIVE_TASK.json`。
- 要求全部独立任务状态均为Verified。
- 要求活动任务处于`VERIFIED_HOLD`。
- 要求`verificationHold.taskId`、`activeTask.id`和`lastVerifiedTask.id`一致。
- 要求`verificationHold.finalTask=true`、`nextTaskId=null`。
- 要求`deferredVerification`与`deferredTasks`均为空。
- 要求`verificationHold.verifiedTasks`完整覆盖任务索引且不存在额外任务。

### 2. 提交可达性

- 发布工作流继续使用完整Git历史。
- 要求`lastVerifiedTask.commit`和`lastVerifiedTask.evidenceHead`均为当前发布提交的可达祖先。
- 不要求发布提交等于产品实现提交，允许其后存在合法治理关闭提交。

### 3. 回归测试与文档

- 增加后续任务未Verified、延期验证未清空、保持状态不一致、验证任务不一致和提交不可达等阻断测试。
- 保留SemVer、main分支、工作流配置、资产校验和不可变Release约束。
- 同步发布流程、任务索引、路线图和验收文档。

## 非目标

- 不执行真实GitHub Release。
- 不修改产品业务代码、数据库Schema、Migration或自用便携交付边界。
- 不新增签名、公证、安装器、自动更新或第三方公开分发能力。
- 不重写历史已Verified任务卡和历史Evidence。

## 依赖

M8-05（Verified）

## 主要影响范围

- `scripts/release-tool.mjs`
- `tests/unit/release-tool.test.ts`
- `.github/workflows/release.yml`
- `docs/tasks/`
- `docs/process/`
- `docs/roadmap/`
- `docs/testing/`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `README.md`
- `CHANGELOG.md`

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/ACTIVE_TASK.json`
- `docs/tasks/TASK_INDEX.md`
- `docs/tasks/M8/M8-05_RUNTIME_HARDENING_DOCUMENTATION_SYNC.md`
- `docs/process/DEVELOPMENT_AUTOMATION.md`
- `docs/process/WORKFLOW_EXECUTION_ORDER.md`
- `docs/roadmap/V1.0_ROADMAP.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`
- `.github/workflows/release.yml`

## 验收条件

1. 任一独立任务不是Verified时，发布门失败并列出任务ID与状态。
2. 活动任务不处于`VERIFIED_HOLD`时，发布门失败。
3. `deferredVerification`或`deferredTasks`非空时，发布门失败。
4. 最终保持任务、活动任务和最近验证任务不一致时，发布门失败。
5. 最终保持任务清单与任务索引不一致时，发布门失败。
6. 受检提交或Evidence提交不是当前发布提交的可达祖先时，发布门失败。
7. 全部条件满足、版本一致且工作流从main运行时，发布门通过。
8. 质量、安全、性能、Evidence、任务治理与PR策略门禁全部通过。

## 验证命令

- `pnpm check:language`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test`
- `pnpm release:check`
- `pnpm build`

## 完成记录

实现、门禁运行、Evidence和最终关闭信息在任务达到Implemented后补充。
