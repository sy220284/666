# M8-02 C8完整体验、硬化与自用交付关闭

> 状态：In Progress  
> 里程碑：M8 最终体验与自用交付验收  
> 优先级：P0  
> 正式分支：`work/m8-02-performance-e2e-ai-eval`

## 目标

在M4-04核心功能进入Implementation Hold后，集中完成C8：首次使用、统一工作台、主题与无障碍、安全、性能、Electron E2E、AI Eval以及Windows、macOS、Linux自用便携工件验收。

V1.0发布范围已经收敛为仓库所有者本人自用。正式边界见`docs/product/SELF_USE_RELEASE_POLICY.md`。M8-02以GitHub Actions永久门禁和专项工作流结果作为最终验收依据。

## 阶段定位

M8-02是M4-04之后唯一活动的最终任务，吸收原M7-01、M7-02、M7-03、M8-01和M8-03。M8-02保持单一任务、单一正式分支和单一Draft PR，不拆分状态或另建发布任务。

## 非目标

- 不重建M4-04已经交付的Prompt、GenerationRun、Candidate、StateProposal、搜索、导入或恢复系统。
- 不以局部单元测试代替完整Electron路径。
- 不把未验证Provider或Model的偶然成功标记为稳定支持。
- 不为达成门禁而隐藏、跳过或伪造Actions失败项。
- 不要求线下物理DPI、混合DPI、真实多屏或跨屏移动测试。
- 不要求实体屏幕阅读器、人工IME、自定义字体、人工视觉复核或线下五分钟新手流程。
- 不要求Linux实体自用主机启动记录。
- 不要求真实Provider账号或线下模型质量测试；必须保证协议Fixture、错误映射和离线降级通过。
- 不面向公众、客户、团队或第三方分发。
- 不要求Windows代码签名、macOS Developer ID签名或Apple公证。
- 不要求MSI、MSIX、PKG、DMG、DEB或RPM安装器。
- 不要求安装、修复、自动更新、覆盖升级或卸载生命周期矩阵。

## 依赖

M4-04

## 吸收来源

- `docs/tasks/M7/M7-01_ONBOARDING_MODES_PATHS.md`
- `docs/tasks/M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md`
- `docs/tasks/M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md`
- `docs/tasks/M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md`
- `docs/tasks/M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md`

被吸收任务只提供需求来源。与本任务卡、GitHub Actions验收口径及自用发布策略冲突的线下设备、公开分发、签名、公证和安装器要求均由本任务卡及`SELF_USE_RELEASE_POLICY.md`覆盖。

## 关联

- 验收：`docs/testing/P0_ACCEPTANCE_MATRIX.md`
- UI验收：`docs/ui/UI_ACCEPTANCE_CHECKLIST.md`
- 自用发布边界：`docs/product/SELF_USE_RELEASE_POLICY.md`
- Evidence：`docs/test-evidence/M8-02/`

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/ACTIVE_TASK.json`
- `docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `docs/product/SELF_USE_RELEASE_POLICY.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/security/THREAT_MODEL.md`
- `docs/security/PRIVACY_AND_LOGGING.md`

## 主要影响范围

- `apps/desktop/`
- `packages/contracts/`
- `packages/core-service/`
- `migrations/`
- `tests/e2e/`
- `tests/unit/`
- `tests/performance/`
- `tests/security/`
- `tests/integration/`
- `tests/migration/`
- `evals/`
- `scripts/`
- `.github/workflows/`
- `.github/governance/`
- `docs/database/`
- `docs/ui/`
- `docs/testing/`
- `docs/security/`
- `docs/product/`
- `docs/test-evidence/M8-02/`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `README.md`
- `CHANGELOG.md`

大范围架构重写必须单独立项，禁止在验收任务内无计划扩张。

## 实施内容

### 1. 首次使用与创作路径

- 完成快速、完整、导入、空白入口。
- 完成自主、混合、AI优先三条创作路径。
- 空、加载、失败、取消、只读、恢复和重启状态清晰可达。

### 2. 统一工作台体验

- 完成全工作台接入、StatusArbiter、跨工作台返回原位置、上下文帮助和真实禁用原因。
- 统一模式与主题状态真源，禁止页面级旁路。
- 复核继续写作、Candidate审阅、状态裁决、搜索、导入和恢复的端到端体验。

### 3. 主题、无障碍与显示

- 完成Theme A/B、浅色、深色、护眼和高对比。
- 完成减少动态、键盘操作、焦点、无障碍语义和非颜色表达。
- 在GitHub Actions中验证1280×800、2K、21:9合成视口、缩放矩阵、窗口恢复、键盘焦点和输入边界；线下设备不属于完成条件。

### 4. 安全、数据与隐私硬化

- 复核Electron、IPC、Migration、Candidate、GenerationRun、StateProposal、凭据、网络、日志、备份和恢复硬门。
- 验证正文、Prompt、凭据和原始Provider响应不进入不允许的日志或设置。
- 验证历史Schema升级、失败回滚、只读保护和恢复点。

### 5. 性能、E2E与AI Eval

- 验证2K键入、自动保存、编辑IPC、5000字Diff、FTS和恢复性能预算。
- 记录长章节、百万字、FTS、多任务、Candidate历史、校验、备份和恢复数据。
- 完成项目创建→写作→T0/T1→改写/融合→审阅→采用→定稿→状态提取→作者裁决→校验→导出→恢复完整Electron E2E。
- 按Provider协议、Task和PromptVersion验证AI协议与质量边界；真实Provider不可用时，Actions中的Fixture、错误映射和离线降级通过即满足V1.0验收。

### 6. 跨平台自用便携交付

- 在Windows、macOS和Linux GitHub-hosted原生Runner完成便携构建、ASAR、Electron Fuses、Hash、资产完整性和启动验证。
- 验证程序目录与作者项目目录分离；替换或删除程序目录不得删除作品、数据库或备份。
- 验证新版本便携包能够打开既有项目并执行必要Migration。
- `signed: false`和`notarized: false`作为工件事实记录，不构成自用交付失败。
- 输出允许自用、有条件允许自用或禁止自用结论。
- 不输出公开发布、可信发布者、安装器或应用商店就绪结论。

## 当前实施审计

> 审计日期：2026-07-28  
> Draft PR：[#224](https://github.com/sy220284/666/pull/224)

### 已完成实现

- 快速、完整、导入、空白四入口和自主、混合、AI优先三条路径。
- 新手/专业披露度、统一工作台、沉浸视图、上下文帮助和跨工作台继续位置。
- StatusArbiter接入Candidate、StateProposal、Validation、FTS和备份失败账本权威查询。
- `candidate.list`支持按projectId跨章节读取全项目Candidate。
- AI优先仅在当前会话Provider连接测试成功后解锁。
- Theme A/B及浅色、深色、护眼、高对比、减少动态和键盘焦点。
- 安全诊断包白名单、原子导出和Main可信确认。
- 三平台原生便携打包、ASAR完整性、Electron Fuses、Hash、启动握手和CI工件。
- 结构化性能证据、备份失败权威账本及对应Migration/Integration测试。
- Windows关闭项目后立即重开的生命周期竞态已修复并通过Windows完整Electron E2E。

### 当前验收边界

- GitHub Actions永久门禁和专项工作流是V1.0最终验收来源。
- 线下物理显示、多屏、实体读屏、人工IME、自定义字体、人工视觉复核、线下新手流程和实体主机测试不属于完成条件。
- 真实Provider账号与线下模型质量测试不属于完成条件；Actions必须验证协议Fixture、错误映射、离线降级和无AI基础写作。
- Windows代码签名、macOS签名/公证和安装/升级/卸载已经明确移出V1.0自用范围。
- 真实超大DOCX、多进程备份幂等、长期运行、Renderer帧率和Core事件循环仍由GitHub Actions推进。

## 测试与证据

必须执行并保存真实Actions结果：

- Workspace与Boundary
- Prettier、ESLint、TypeScript
- Unit、Integration、Migration、Coverage
- Security、Performance、AI协议与Fixture Eval
- Build、Package Smoke、三平台自用便携打包
- Electron E2E、合成显示矩阵、键盘焦点、无障碍语义和输入边界
- 超大DOCX、多进程备份幂等、长期运行、Renderer帧率和Core事件循环专项
- Evidence、PR Policy、Task Governance、Repository Governance

Evidence必须记录GitHub Actions环境、平台、Fixture规模、真实运行编号、失败和未执行原因。线下设备、人工设备测试、真实Provider账号、签名、公证、安装器及安装生命周期应记录为非目标或已知限制，不得记录为Blocked或Fail。

## 完成条件

- M4-04保持Implemented或Verified，不被回写。
- 首次使用、统一工作台、主题、安全、数据和核心显示路径完成。
- 隐私、Migration、恢复、凭据和本地数据边界通过。
- 性能预算、完整Electron E2E和AI协议/Fixture Eval通过；无真实Provider时基础写作降级可用。
- Windows、macOS和Linux自用便携工件完成原生Runner构建、完整性和启动验收。
- 新便携版本能够打开既有项目，作者数据不依赖程序目录。
- P0矩阵、追踪矩阵、README、自用发布策略和Evidence与代码一致。
- 最终Evidence绑定实际受检Head和可达main提交。
- 无P0代码硬保证、数据安全、恢复或Actions专项未解释失败后，任务可转Ready并关闭。

线下设备、人工设备测试、真实Provider账号、代码签名、Apple公证、系统安装器以及安装/升级/卸载生命周期不属于本任务完成条件。
