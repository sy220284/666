# M8-08 V1.0最终质量治理与封版闭环

> 状态：Implemented
> 里程碑：M8长期维护
> 优先级：P0
> 正式分支：`work/m8-08-v1-final-governance-closure`
> 交付方式：单任务、单分支、单PR、单次受控合并
> 实施基线：`main@44fc199c0d4725a9aa169865309674954143f5cf`
> 开发依赖：`M8-06`已Verified
> 封版依赖：`M8-07`已完成Verified闭环
> 后续任务：无
> 实施证据Head：`695a74cb5e42901d7a0d177b8811c857a40736d3`
> 三平台工件：Runs `30623725133`、`30624246649`
> 目标终态：`VERIFIED_HOLD`

## 一、任务定位

本任务承接2026-07-30 V1.0全量深度审计，并适配已经进入`main`的多任务并行治理模型。

M8-08允许与M8-07并行开发，但遵守以下硬边界：

```text
多任务开发与PR门禁可以并行
→ main写入保持串行
→ M8-07未Verified时，M8-08不得进入最终封版合并、发布或VERIFIED_HOLD
```

M8-08负责一次性完成：

```text
正文保存安全
→ AI检查异步稳定性
→ 关闭与切换安全反馈
→ 应用/项目能力矩阵
→ 关键跨进程测试与覆盖
→ 最终main验证治理
→ 版本与文档统一
→ 三平台自用便携包封版
```

禁止拆分为新的独立治理任务。

## 二、并行执行边界

### 2.1 可立即并行实施

- 正文保存竞态复现与修复
- 正文块稳定身份同步
- AI检查串行轮询
- 保存、切章、关闭统一刷新协议
- 应用与项目能力矩阵
- 独立单元、集成、安全与E2E测试
- M8-08 Evidence建设

### 2.2 必须串行收口

- M8-07仍在修改或验收的同名文件
- `.github/workflows/`与`.github/governance/`最终门禁调整
- `README.md`、`CHANGELOG.md`与版本号
- 最终main验证与三平台发布
- M8-08最终合并、Verified与`VERIFIED_HOLD`

### 2.3 冲突处理

1. 每次准备修改前同步最新`main`。
2. 与其他活动PR修改同一文件时，M8-08后写方负责重放和复核。
3. 旧Head门禁结果不得复用于重放后的新Head。
4. 最终合并前必须重新比较M8-08分支与最新`main`全部差异。

## 三、治理目标

1. 消除保存请求在途时继续编辑造成的新输入丢失风险。
2. 消除持久化正文块元数据按数组位置错误绑定风险。
3. 保证自动保存、手动保存、切章、工作台切换、项目关闭和应用退出共用同一安全刷新协议。
4. 修复AI检查轮询重叠、未处理Promise拒绝和永久Pending。
5. 建立统一的应用与项目能力矩阵。
6. 区分正常、兼容只读、完整性损坏和仅恢复模式。
7. 补齐关键跨进程边界测试与等价覆盖证据。
8. 保证最终`main`提交本身重新运行完整验证。
9. 统一版本、CHANGELOG、README、任务索引和发布状态。
10. 生成并验证Windows、macOS、Linux自用便携工件。

## 四、P0：正文保存安全

### 4.1 保存上下文

每次保存必须捕获不可变上下文：

```text
SaveContext
├─ projectId
├─ chapterId
├─ draftId
├─ baseRevision
├─ editorGeneration
├─ documentFingerprint
├─ blockIdentityMap
└─ requestedAt
```

### 4.2 返回结果处理

保存返回后依次判断：

```text
作品/章节/当前稿身份仍一致
→ 当前编辑器是否仍处于保存快照
→ 每个正文块是否可按稳定身份映射
```

处理规则：

- 编辑器未变化：允许同步Revision、Hash、逻辑块ID、来源与锁定状态。
- 编辑器已继续编辑但结构未变化：只同步稳定身份可确认的元数据，不覆盖文本、选区和编辑历史；立即调度下一轮保存。
- 编辑器结构已变化：禁止使用旧保存结果执行`setContent`；保留当前状态和未保存标记，按最新状态继续保存。
- 身份无法确认：保留当前编辑内容，进入显式冲突处理，禁止静默覆盖。

### 4.3 稳定身份

优先级：

```text
clientBlockId
→ logicalBlockId
→ 明确Patch结果映射
```

数组下标不得作为唯一身份依据。

### 4.4 统一入口

以下入口必须使用同一安全刷新协议：

- 自动保存
- 手动保存
- 切换章节
- 返回项目
- 打开规划、设定、检查或建议稿
- 关闭项目
- 关闭应用
- Core重启前刷新

## 五、P1治理

### 5.1 AI检查轮询

改为串行轮询：

```text
await getRun
→ 处理结果或错误
→ 延迟
→ 下一次getRun
```

要求：

- 同一Run只允许一个查询在途。
- 所有拒绝均被捕获。
- 连续失败使用有上限退避。
- 页面卸载、项目切换或Run终止后停止。
- 失败不得永久保留Pending。
- 终态刷新检查结果。

### 5.2 关闭与切换

保存失败、冲突或超时时必须阻止静默关闭并显示：

- 重试保存
- 返回正文检查
- 打开恢复中心
- 取消关闭

任何放弃未保存修改的入口必须二次确认，不得作为默认操作。

### 5.3 应用就绪状态

必须区分：

```text
shellReady
coreReady
productReady
projectReady
```

成品启动冒烟不得只以Renderer挂载认定产品可用。

### 5.4 能力矩阵

```text
ApplicationCapabilities
├─ shellAvailable
├─ coreAvailable
├─ settingsAvailable
├─ providerAvailable
├─ generationAvailable
└─ diagnosticsAvailable

ProjectCapabilities
├─ projectReadable
├─ projectWritable
├─ databaseReadable
├─ structureReadable
├─ draftReadable
├─ draftWritable
├─ canonReadable
├─ canonWritable
├─ exportAvailable
├─ backupAvailable
├─ restoreAvailable
└─ moveAvailable
```

项目模式至少区分：

```text
normal
read-only-compatible
read-only-integrity-failed
recovery-only
```

`recovery-only`只允许恢复、导出恢复点版本、恢复为新副本和关闭项目。

## 六、测试要求

### 6.1 正文保存竞态

必须覆盖：

1. 保存期间继续输入。
2. 保存期间分段。
3. 保存期间合并正文块。
4. 保存期间修改块类型。
5. 保存期间重排。
6. 保存期间切章。
7. 保存期间关闭。
8. Revision或Hash冲突。

核心断言：

```text
当前编辑器内容
= 重开章节内容
= SQLite当前稿内容
```

同时验证正文块身份、Hash和锁定状态属于正确正文块。

### 6.2 AI检查

覆盖请求延迟超过轮询周期、Core临时不可用、连续失败退避、页面卸载、项目切换、成功、失败、取消和终态刷新。

### 6.3 能力矩阵

覆盖正常可写、兼容只读、完整性损坏、仅恢复、Core不可用、Provider未配置、Provider不可用和数据库可读不可写。

### 6.4 关闭刷新

覆盖自动保存进行中、手动保存进行中、保存失败、冲突、Core重启、Renderer无响应、超时、重试和取消关闭。

### 6.5 跨进程边界

必须为以下边界提供覆盖率或等价分支证据：

- Electron Main启动与关闭协调
- Core Supervisor
- IPC Handlers
- Generation IPC
- Preload入口
- Renderer Bridge
- Request Lifecycle
- Utility Routers

建议门槛：Lines/Functions/Statements不低于75%，Branches不低于65%。

## 七、最终验证与封版

最终main必须执行：

```text
静态检查
Unit
Integration
Migration
Coverage
Security
Performance
AI协议基线
Electron E2E
Build
Linux成品启动冒烟
```

三平台原生Runner分别执行构建和启动验证。来源PR结果不得替代最终main验证。

正式版本统一为`1.0.0`，并同步：

- 根与Workspace版本策略
- 应用、Renderer、Core、Recovery诊断版本
- Manifest与工件名
- CHANGELOG正式版本段
- README当前状态与真实技术栈
- TASK_INDEX与追踪矩阵

## 八、主要影响范围

- `apps/desktop/renderer/src/`
- `apps/desktop/preload/src/`
- `apps/desktop/main/src/`
- `packages/editor-core/src/`
- `packages/contracts/src/`
- `packages/core-service/src/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/performance/`
- `tests/e2e/`
- `.github/workflows/`
- `.github/governance/`
- `scripts/`
- `docs/tasks/`
- `docs/process/`
- `docs/product/`
- `docs/testing/`
- `docs/roadmap/`
- `docs/test-evidence/M8-08/`
- `README.md`
- `CHANGELOG.md`
- `package.json`
- `pnpm-lock.yaml`

## 九、禁止范围

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

除非无法在不修改Schema的情况下修复P0，否则禁止新增或修改Migration。

## 十、必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/TASK_AUTHORIZATION.json`
- `docs/tasks/runtime/M8-07.json`
- `docs/tasks/TASK_INDEX.md`
- `docs/tasks/M8/M8-07_CHINESE_EXPERIENCE_GOVERNANCE.md`
- `docs/process/CI_PARALLEL_TOOLCHAIN_MULTITASK.md`
- `docs/process/RELEASE_QUALIFICATION.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`

## 十一、Evidence

新增：

```text
docs/test-evidence/M8-08/
```

至少包含：

- `summary.md`
- `baseline-audit.md`
- `implementation-review.md`
- `autosave-race-reproduction.md`
- `autosave-race-fix-verification.md`
- `cross-process-coverage.md`
- `capability-matrix-verification.md`
- `main-final-verification.md`
- `release-artifacts.md`
- `known-limitations.md`

## 十二、完成判定

全部满足后才能转为Verified和`VERIFIED_HOLD`：

```text
P0正文竞态已修复
P1封版问题已关闭
P2问题完成或明确为非阻断限制
M8-07已经Verified
所有新增测试通过
关键跨进程覆盖达标
PR永久门禁成功
最终main完整复跑成功
三平台工件成功
版本统一为1.0.0
文档与任务状态统一
Evidence绑定最终提交
无延期验证
无后续治理任务
```

任何一项未满足，均不得创建V1.0 Release或宣称正式封版完成。
