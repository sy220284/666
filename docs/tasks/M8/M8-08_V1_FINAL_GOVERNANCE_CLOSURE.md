# M8-08 V1.0最终质量治理与封版闭环

> 状态：Planned  
> 里程碑：M8长期维护  
> 优先级：P0  
> 正式分支：`work/m8-08-v1-final-governance-closure`  
> 交付方式：单分支、单PR、单次受控合并  
> 前置基线：`main@dd0793064962852603a5a66f0b0da29383085148`  
> 后续任务：无  
> 目标终态：`VERIFIED_HOLD`

## 一、任务定义

本任务对WorldForge V1.0进行一次性最终治理，覆盖正文保存安全、异步请求稳定性、异常状态、功能能力协调、测试覆盖、最终main验证、版本文档统一及三平台自用便携包封版。

全部问题必须在本任务内完成实现修复、回归测试、跨功能复核、文档同步、版本升级、最终main验证与发布资格确认。禁止将正文竞态、CI治理、版本升级、异常体验或文档同步拆成新的独立任务。

## 二、治理目标

1. 消除正文保存期间继续编辑可能造成的新输入丢失。
2. 消除持久化正文块元数据按数组位置错误绑定的问题。
3. 保证自动保存、手动保存、切章、返回项目、项目切换和关闭应用共用同一套安全刷新规则。
4. 修复AI检查轮询重复请求和未处理异步异常。
5. 建立统一的应用与项目能力判断。
6. 补全关键跨进程边界测试和覆盖率。
7. 保证最终`main`提交本身通过完整运行验证。
8. 将版本、CHANGELOG、README、任务索引和发布状态统一为V1.0正式状态。
9. 生成并验证Windows、macOS、Linux自用便携工件。
10. 完成V1.0治理终态，不保留代码完成但封版未闭环的中间状态。

### 完成定义

```text
无已知P0问题
无未处理封版P1问题
正文保存竞态完成真实延迟回归
关键跨进程链路完成自动化验证
最终main重新运行完整门禁
版本统一为1.0.0
CHANGELOG存在正式1.0.0版本段
三平台自用便携工件验证通过
任务进入VERIFIED_HOLD
```

## 三、问题治理范围

### 1. P0：正文保存安全

#### 1.1 保存返回覆盖保存期间的新输入

保存请求发出后，作者仍可继续输入、删除、分段、合并、粘贴、修改正文块类型和调整结构。旧保存结果返回时，不得使用旧内容覆盖当前编辑器中的新状态。

#### 1.2 正文块元数据按位置错误绑定

禁止继续仅按照数组位置将服务端返回的以下元数据绑定到当前编辑器正文块：

- `logicalBlockId`
- `contentHash`
- `source`
- `locked`
- 持久化状态

元数据同步必须建立稳定身份或明确映射依据。

#### 1.3 强制实现要求

每次保存必须形成明确的保存上下文：

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

保存返回后依次判断：

```text
作品、章节、当前稿身份是否一致
→ 当前编辑器是否仍处于原保存快照
→ 每个正文块身份是否可以安全映射
```

处理规则：

- 当前编辑器未变化时，允许同步Revision、Hash、持久化逻辑块ID、来源和锁定状态。
- 当前编辑器已继续编辑但结构未变化时，只同步通过稳定身份确认的元数据；不得覆盖当前文本、选区、编辑历史和保存后新增修改；同步后立即调度下一轮保存。
- 当前编辑器结构已变化时，禁止使用旧结果执行正文重置；保留当前编辑器状态，维持未保存标记，根据最新状态重新生成Patch并执行下一轮保存。
- 无法确认身份映射时，重新读取服务端当前稿并进入显式冲突处理，禁止静默覆盖。

稳定身份优先级：

```text
clientBlockId
→ logicalBlockId
→ 明确的Patch操作结果映射
```

数组下标不得作为唯一身份依据。

#### 1.4 保存链路统一

以下入口必须使用同一安全刷新协议：

- 自动保存
- 手动保存
- 切换章节
- 返回项目
- 打开规划
- 打开设定
- 打开检查
- 打开建议稿
- 关闭项目
- 关闭应用
- Core重启前刷新

任何入口不得继续使用旧保存路径。

### 2. P1：AI检查轮询稳定性

固定间隔轮询改为串行轮询：

```text
发起getRun
→ 等待返回
→ 处理成功、失败或取消
→ 根据状态决定是否继续
→ 延迟后发起下一次
```

要求：

- 同一Run只允许一个`getRun`请求在途。
- 所有Promise拒绝必须被捕获。
- Core临时不可用时进入可重试状态。
- 连续失败使用退避机制。
- 页面卸载、项目切换或Run终止后停止轮询。
- 不得产生未处理Promise拒绝。
- 轮询失败不得永久保留`pending=true`。
- 终态必须刷新检查结果。

### 3. P1：关闭与切换安全反馈

关闭前刷新失败、冲突或超时时，必须展示明确阻断状态：

```text
当前稿尚未安全保存，程序没有关闭。
```

至少提供：

- 重试保存
- 返回正文检查
- 打开恢复中心
- 取消关闭

如提供“放弃未保存修改并退出”，必须明确显示可能丢失的内容范围、要求二次确认、不得作为默认操作、不得在超时后自动执行，并写入不含正文内容的本地诊断记录。

章节切换、项目关闭和应用退出必须使用一致的反馈语义。

### 4. P1：应用就绪状态治理

必须区分：

```text
shellReady
coreReady
productReady
projectReady
```

定义：

- `shellReady`：Renderer壳已挂载。
- `coreReady`：Core可以处理请求。
- `productReady`：设置、最近项目和基础能力已完成初始化。
- `projectReady`：当前作品达到对应操作条件。

打包冒烟测试不得仅以`rendererReady=true`认定产品可用，至少验证Core正常、基础设置读取成功、首页初始化完成、创建或打开作品入口可用。

### 5. P1/P2：统一能力矩阵

新增统一能力模型，禁止各页面独立推断完整可用性。

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

`recovery-only`只允许进入恢复中心、恢复点浏览、安全版本导出、恢复为新副本和关闭项目。不得继续显示继续写作、完整规划、人物与设定编辑、AI生成、作品检查或项目移动等不可用能力。

所有主导航、首页入口和工作台按钮必须统一读取能力矩阵。

### 6. P2：规划状态一致性

治理以下状态：

- 简明规划与完整规划切换状态。
- “稍后填写”状态。
- 页面重新进入后的模式恢复。
- 全局作者模式与规划局部模式的关系。

要求：

- 不得因组件重新挂载而无提示恢复到其他模式。
- 跳过任务书不得清空已有数据。
- 局部模式设置应持久化，或采用明确且统一的全局规则。
- 文案必须准确说明设置影响显示方式还是全局创作模式。

### 7. P2：错误表达统一

所有作者可见错误统一通过作者化错误映射层输出。

禁止直接展示：

- 原始`Error.message`
- 内部英文错误
- 错误码与英文信息简单拼接
- 堆栈
- 绝对路径
- Provider凭据
- 数据库内部结构

技术详情仅允许在折叠区域显示可公开错误码、请求标识和可执行处理建议。

以下功能必须统一：正文保存、项目管理、规划、人物与设定、AI生成、作品检查、搜索替换、导入导出、备份恢复。

## 四、测试治理要求

### 1. 正文保存竞态测试

必须新增单元、集成和Electron E2E测试。

#### 场景一：保存期间继续输入

```text
输入A
→ 触发保存
→ 延迟服务端返回
→ 继续输入B
→ 保存A返回
→ 编辑器仍为A+B
→ 下一轮保存完成
→ 重开章节仍为A+B
```

#### 场景二：保存期间分段

```text
单正文块
→ 触发保存
→ 保存期间按Enter分成两个正文块
→ 旧保存返回
→ 两个正文块保持存在
→ 逻辑块ID无错绑
→ 最终重开一致
```

#### 场景三：保存期间合并正文块

```text
两个正文块
→ 触发保存
→ 保存期间合并
→ 旧保存返回
→ 不恢复为两个正文块
→ 不发生逻辑ID错绑
```

#### 场景四：保存期间修改块类型

```text
段落
→ 触发保存
→ 保存期间改为对白或标题
→ 旧保存返回
→ 不用旧段落结构覆盖当前状态
```

#### 场景五：保存期间重排

如编辑器支持正文块移动，必须验证旧元数据不会按原下标绑定到新位置，锁定和Hash仍属于正确正文块。

#### 场景六：保存期间切章

验证原章节安全保存，新章节不接收旧章节响应，旧响应不能写回新章节状态，选区和写作位置属于正确章节。

#### 场景七：保存期间关闭

验证刷新成功后关闭；保存失败阻止关闭；超时显示明确提示；重试后可正常关闭；不得静默丢弃正文。

#### 场景八：冲突

模拟Revision或Hash冲突，要求当前编辑内容保留，服务端内容不静默覆盖当前编辑器，用户收到明确冲突提示，并可重试、重新读取或进入恢复流程。

### 2. AI检查轮询测试

必须覆盖：

- 单次请求延迟超过轮询周期
- Core临时不可用
- 连续失败退避
- 页面卸载
- 项目切换
- Run成功
- Run失败
- Run取消
- 终态刷新问题清单
- 无未处理Promise拒绝
- `pending`最终正确清除

### 3. 能力矩阵测试

必须覆盖：

```text
正常可写项目
兼容只读项目
完整性损坏项目
仅恢复项目
Core不可用
Provider未配置
Provider不可用
数据库可读但不可写
```

验证所有主导航和按钮的显示、禁用、禁用原因、恢复路径及能力泄漏。

### 4. 关闭刷新测试

必须覆盖：

- 自动保存完成后关闭
- 自动保存进行中时关闭
- 手动保存进行中时关闭
- 保存失败
- 保存冲突
- Core重启
- Renderer无响应
- 超时后窗口恢复
- 重试成功
- 用户取消关闭

### 5. 关键跨进程覆盖率

以下文件不得继续全部排除在覆盖率体系之外：

- Electron Main启动与关闭协调
- Core Supervisor
- IPC Handlers
- Generation IPC
- Preload主入口
- Renderer Bridge Adapter
- Request Lifecycle
- Utility Project Routers

可采用纳入现有覆盖率、建立独立边界覆盖率门禁或建立显式分支测试矩阵。禁止只依靠存在测试文件代替覆盖率要求。

建议最低要求：

```text
Lines ≥ 75%
Functions ≥ 75%
Statements ≥ 75%
Branches ≥ 65%
```

无法通过常规覆盖工具统计的Electron入口，必须提供对应安全测试和E2E证据矩阵。

## 五、最终main验证治理

### 1. 验证原则

最终发布判断必须针对最终`main`提交本身。来源PR永久门禁成功只能作为来源证明，不得替代最终main运行验证。

### 2. 最终main必须重新运行

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

三平台发布工作流必须分别执行：

```text
Windows原生Runner构建与启动验证
macOS原生Runner构建与启动验证
Linux原生Runner构建与启动验证
```

### 3. 状态文案修正

只执行静态检查时，禁止发布“Final main SHA passed full Linux verification”等完整验证描述。状态文案必须与实际执行范围一致。只有最终main完整运行验证成功后，才允许发布完整验证通过状态。

### 4. 合并一致性

来源PR Head应同步最新main；Squash Merge完成后，必须对最终main完整执行运行门禁。本任务以最终main完整复跑为强制要求。

## 六、版本与文档封版

### 1. 版本统一

正式产品版本统一为`1.0.0`。

检查并统一：

- 根`package.json`
- Workspace相关包版本策略
- 应用信息
- Renderer展示版本
- Core诊断版本
- Recovery运行时版本
- 打包脚本
- Release脚本
- 工件名称
- Manifest
- 测试Fixture

禁止保留业务代码硬编码`0.1.0`，版本应从统一应用元数据读取。

### 2. CHANGELOG

将现有`Unreleased`内容整理为正式`1.0.0`版本区段，发布日期使用实际发布日；`Unreleased`保留为空白后续区段。

必须记录：

- 正文保存竞态修复
- 正文块身份同步修复
- AI检查轮询修复
- 关闭失败提示
- 能力矩阵
- 最终main完整验证
- V1.0正式版本统一

### 3. README

同步当前版本、V1.0自用便携版状态、真实技术栈、当前任务终态和发布限制。清理历史进行中表述。数据库实现必须与当前代码一致。

### 4. 任务数量统一

重新计算独立任务数量，并统一以下文件：

- `ACTIVE_TASK.json`
- `TASK_INDEX.md`
- `V1.0_TRACEABILITY_MATRIX.md`
- `V1.0_ROADMAP.md`
- README
- 发布资格脚本
- 本任务Evidence

不得继续同时出现37张和38张独立任务。

### 5. 历史任务保护

禁止回写或改造已经冻结的历史任务实现Evidence。允许修正当前汇总状态并在M8-08 Evidence中引用历史任务。禁止篡改历史任务受检提交、将新测试伪装成历史原始证据、修改历史Migration或重新解释历史失败。

## 七、实施范围

### 1. 允许修改

```text
apps/desktop/renderer/src/
apps/desktop/preload/src/
apps/desktop/main/src/
packages/editor-core/src/
packages/contracts/src/
packages/core-service/src/
tests/unit/
tests/integration/
tests/security/
tests/performance/
tests/e2e/
.github/workflows/
.github/governance/
scripts/
docs/tasks/
docs/process/
docs/product/
docs/testing/
docs/roadmap/
docs/test-evidence/M8-08/
README.md
CHANGELOG.md
package.json
pnpm-lock.yaml
```

版本同步需要修改Workspace包`package.json`时，允许纳入本任务。

### 2. 禁止修改

```text
migrations/
docs/test-evidence/M0/
docs/test-evidence/M1/
docs/test-evidence/M2/
docs/test-evidence/M3/
docs/test-evidence/M4-04/
docs/test-evidence/M8-02/
docs/test-evidence/M8-04/
docs/test-evidence/M8-05/
docs/test-evidence/M8-06/
```

除非确认无法在不修改Schema的情况下修复P0问题，否则禁止新增或修改数据库Migration。确需Schema变化时，必须在本任务内完成，并提供必要性证明、向前兼容、旧项目迁移、失败回滚、备份恢复和Migration测试。

## 八、非目标

本任务不负责：

- 新增产品功能
- 重做整体UI视觉设计
- 引入云端服务
- 增加新的AI Provider种类
- 修改AI内容质量目标
- 增加多人协作
- 增加云同步
- 增加自动更新
- 增加安装器
- 增加代码签名和Apple公证
- 大规模重写编辑器
- 为重构而重构全部大型文件
- 修改V1.0自用发布边界

允许为修复问题进行必要的小范围模块拆分，禁止将任务扩大为架构重写。

## 九、实施顺序

```text
阶段一：建立失败复现
├─ 自动保存期间继续输入
├─ 分段、合并、类型变化
├─ 旧响应元数据错绑
└─ AI检查重复轮询

阶段二：正文保存核心修复
├─ SaveContext
├─ 编辑器代次
├─ 文档Fingerprint
├─ 稳定正文块身份映射
├─ 禁止旧setContent覆盖
└─ 下一轮保存调度

阶段三：跨入口接线
├─ 手动保存
├─ 自动保存
├─ 切章
├─ 返回项目
├─ 打开其他工作台
├─ 关闭项目
└─ 关闭应用

阶段四：异步与异常状态
├─ AI检查串行轮询
├─ 关闭失败反馈
├─ Renderer就绪分层
└─ 错误作者化

阶段五：能力协调
├─ ApplicationCapabilities
├─ ProjectCapabilities
├─ recovery-only
├─ 主导航
└─ 各工作台按钮

阶段六：测试和覆盖率
├─ Unit
├─ Integration
├─ Security
├─ Performance
├─ Electron E2E
└─ 跨进程覆盖率

阶段七：版本封版
├─ 1.0.0
├─ CHANGELOG
├─ README
├─ 任务数量
└─ 发布文档

阶段八：最终验证
├─ PR永久门禁
├─ 受控合并
├─ 最终main完整复跑
├─ 三平台便携包
├─ 启动冒烟
└─ VERIFIED_HOLD
```

## 十、验收条件

1. 保存请求延迟期间继续输入、分段、合并或修改块类型时，旧保存结果不得覆盖新编辑内容。
2. 任何保存返回均不得仅凭数组下标重绑逻辑块ID、Hash、来源或锁定状态。
3. 连续编辑和多轮自动保存结束后，当前编辑器内容、重新打开章节内容和SQLite当前稿内容一致，正文块身份和锁定状态同时一致。
4. 旧章节任何延迟响应都不能修改新章节的正文、Revision、保存状态、选区、写作位置或锁定状态。
5. 保存失败、冲突或超时必须阻止静默关闭并显示明确处理入口。
6. AI检查轮询不存在重复请求异常、未处理Promise拒绝、永久Pending或页面卸载后继续写状态。
7. 受损项目只展示真实可用功能，不得泄漏正常写作能力。
8. 作者界面不直接泄露内部英文错误或不必要技术信息。
9. 跨进程关键边界达到本任务规定的覆盖率或等价证据标准。
10. 最终main提交本身通过Unit、Integration、Migration、Coverage、Security、Performance、AI协议基线、Electron E2E、Build和Linux成品启动冒烟。
11. Windows、macOS、Linux原生Runner均生成符合自用发布策略的便携工件。
12. 代码、应用信息、Manifest、文档与工件统一为`1.0.0`。
13. README、CHANGELOG、路线图、任务索引、追踪矩阵和发布状态不存在互相矛盾。
14. 任务完成后建立M8-08最终`VERIFIED_HOLD`，`deferredVerification`和`deferredTasks`均为空，`nextTaskId=null`。
15. 质量、安全、性能、Evidence、任务治理、仓库治理与PR策略门禁全部通过。

## 十一、验证命令

最终PR至少执行：

```bash
pnpm install --frozen-lockfile
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
pnpm test:e2e
pnpm build
pnpm release:check
```

如仓库实际脚本名称不同，使用对应正式脚本，验证范围不得减少。最终main必须再次执行完整主验证，不得只复用来源PR结果。

## 十二、Evidence要求

新增目录：

```text
docs/test-evidence/M8-08/
```

至少包含：

```text
summary.md
baseline-audit.md
implementation-review.md
autosave-race-reproduction.md
autosave-race-fix-verification.md
cross-process-coverage.md
capability-matrix-verification.md
main-final-verification.md
release-artifacts.md
known-limitations.md
```

Evidence必须记录：

- 基线提交
- 实现提交
- PR Head
- 最终main提交
- 每项门禁运行链接
- 测试数量
- 覆盖率
- E2E关键截图或日志
- 三平台工件名称
- SHA-256
- ASAR完整性
- Electron Fuses
- 已知限制
- 未修改历史Evidence声明

## 十三、PR要求

PR标题：

```text
M8-08：完成V1.0最终质量治理与封版闭环
```

PR正文必须包含：

1. 基线问题。
2. 正文竞态复现。
3. 根因。
4. 修复机制。
5. 未丢失新输入的证据。
6. 正文块身份映射规则。
7. AI轮询修复。
8. 能力矩阵。
9. 关闭安全反馈。
10. 覆盖率变化。
11. 最终main验证策略。
12. 版本与文档同步。
13. 三平台工件结果。
14. 未修改历史Migration和Evidence声明。
15. 已知限制。

每项完成结论必须指向具体文件、测试、运行和Evidence。禁止使用无证据的笼统完成声明。

## 十四、发布限制

V1.0继续保持自用边界：

- 仅仓库所有者本人使用。
- 便携包形式。
- 不面向第三方公开分发。
- 不承诺自动更新。
- 不承诺安装、升级和卸载生命周期。
- Windows工件未签名。
- macOS工件未签名、未公证。
- Linux兼容性以当前Runner和实际自用环境为准。
- 真实Provider长期质量仍属于外部变量。

以上限制必须如实保留，不得因版本升级为1.0.0而删除。

## 十五、最终完成判定

满足以下全部条件后，M8-08才能从`Implemented`转为`VERIFIED_HOLD`：

```text
P0正文竞态已修复
P1封版问题已关闭
P2问题完成或明确保留为非阻断已知限制
所有新增测试通过
关键跨进程覆盖达标
PR永久门禁成功
最终main完整复跑成功
三平台自用便携工件成功
版本统一为1.0.0
文档和任务状态统一
Evidence绑定最终提交
无延期验证
无后续治理任务
```

任何一项未满足，均不得标记Verified、进入`VERIFIED_HOLD`、创建V1.0 Release或宣称V1.0正式封版完成。
