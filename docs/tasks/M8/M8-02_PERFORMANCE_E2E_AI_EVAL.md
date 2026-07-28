# M8-02 C8完整体验、硬化与发布关闭

> 状态：In Progress
> 里程碑：M8 最终体验与发布验收  
> 优先级：P0  
> 建议分支：`work/m8-02-performance-e2e-ai-eval`

## 目标

在M4-04核心功能完成并进入Implementation Hold后，集中完成C8：首次使用与统一工作台最终体验、主题与无障碍、真实显示与数据规模、完整安全/性能/E2E/AI Eval、跨平台构建安装和P0发布关闭。

## 阶段定位

M8-02是M4-04之后的独立最终任务。它吸收原M7-01、M7-02、M7-03、M8-01和M8-03，承接M8-02原有性能、E2E、显示和AI Eval要求。

M8-02在作者明确启动前保持Planned，不因M4-04合并而自动激活。

## 非目标

- 不重建M4-04已经交付的Prompt、GenerationRun、Candidate、StateProposal、搜索、导入或恢复系统。
- 不以模拟平台结果代替Windows、macOS和Linux真实工件验收。
- 不以局部单元测试代替完整Electron路径。
- 不把未验证Provider或Model的偶然成功标记为稳定支持。
- 不为达成门禁而隐藏、跳过或伪造Blocked项。

## 依赖

M4-04

## 吸收来源

- `docs/tasks/M7/M7-01_ONBOARDING_MODES_PATHS.md`
- `docs/tasks/M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md`
- `docs/tasks/M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md`
- `docs/tasks/M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md`
- `docs/tasks/M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md`

## 关联

- 需求：M7—M8全部剩余体验、硬化与发布要求
- 验收：`docs/testing/P0_ACCEPTANCE_MATRIX.md`中的最终P0矩阵
- Evidence：`docs/test-evidence/M8-02/`

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/ACTIVE_TASK.json`
- `docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
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
- `tests/e2e/`
- `tests/unit/`
- `tests/performance/`
- `tests/security/`
- `tests/integration/`
- `evals/`
- `scripts/`
- `.github/workflows/`
- `.github/governance/`
- `docs/ui/`
- `docs/testing/`
- `docs/security/`
- `docs/product/`
- `docs/test-evidence/M8-02/`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- 发布与打包配置

大范围架构重写必须单独立项并阻断M8-02关闭，禁止在验收任务内无计划扩张。

## 实施内容

### 1. 首次使用与创作路径

- 完成快速、完整、导入、空白入口。
- 完成自主、混合、AI初稿三条创作路径。
- 空、加载、失败、取消、只读、恢复和重启状态清晰可达。

### 2. 统一工作台体验

- 完成全工作台接入、StatusArbiter、跨工作台返回原位置、上下文帮助和真实禁用原因。
- 统一模式与主题状态真源，禁止页面级旁路。
- 复核继续写作、Candidate审阅、状态裁决、搜索、导入和恢复的端到端体验。

### 3. 主题、无障碍与显示

- 完成Theme A/B、浅色、深色、护眼和高对比。
- 完成减少动态、键盘操作、焦点、读屏和非颜色表达。
- 验证1280×800、2K 100/125/150%、21:9、混合DPI和真实多屏。

### 4. 安全、数据与隐私硬化

- 复核Electron、IPC、Migration、Candidate、GenerationRun、StateProposal、凭据、网络、日志、备份和恢复硬门。
- 验证正文、Prompt、凭据和原始Provider响应不进入不允许的日志或设置。
- 验证历史Schema升级、失败回滚、只读保护和恢复点。

### 5. 性能、E2E与AI Eval

- 验证2K键入P95≤50ms、自动保存P95≤150ms、编辑IPC P95≤200ms。
- 验证5000字Diff首屏≤500ms、完整≤1.2s，正文滚动≥50fps，Core单次事件循环阻塞<100ms。
- 记录长章节、百万字、FTS、多任务、Candidate历史、校验、备份和恢复真实数据。
- 完成项目创建→写作→T0/T1→改写/融合→审阅→采用→定稿→状态提取→作者裁决→校验→导出→恢复完整Electron E2E。
- 按Provider、Model、Task、PromptVersion记录T0、T1、rewrite、merge、validate、state_extract和连续性Eval。
- Prompt、Eval和ModelSupportProfile版本必须一致；不一致时降级或阻断。

### 6. 跨平台与发布关闭

- 运行Windows、macOS、Linux构建、安装、升级、卸载、启动、原生模块和安全降级矩阵。
- 产物Hash、签名、版本、Migration、回滚和发布说明一致。
- P0项目全部Verified或明确Blocked。
- 输出允许发布、有条件允许或禁止发布结论。

## 当前实施审计

> 审计日期：2026-07-28
> 产品Head：`313e55d926ab7d2b54e2fdc263795c30aeaea904`
> Draft PR：[#224](https://github.com/sy220284/666/pull/224)

### 已完成实现

- 快速、完整、导入、空白四入口和自主、混合、AI优先三条路径；创建事务原子写入任务书、主角、首章与SceneBeat。
- 新手/专业披露度、统一工作台、沉浸视图、上下文帮助、真实禁用原因和跨工作台继续位置。
- StatusArbiter已接入Candidate、StateProposal、Validation和FTS既有权威查询；中断/待审Candidate、pending提案、开放校验和索引状态进入P1—P3仲裁，查询失败显式标记不可读。
- “AI优先”仅在本次会话真实Provider连接测试成功后解锁；Provider修改、删除或应用重启后失效，自主写作和离线功能保持可用。
- Theme A/B、浅色/深色/护眼/高对比、减少动态、键盘焦点和窗口显示状态真源。
- 安全诊断包白名单、`0600`临时文件、原子重命名和SHA-256；最终导出确认已下沉到Main原生可信边界。
- 生产ASAR、完整性、Electron Fuses、三平台原生便携打包、成品启动握手和CI工件。
- Renderer使用固定安全自定义协议，不使用高权限`file://`页面；资源读取受Host、根路径和扩展名白名单保护。
- C8 Electron E2E、三平台Package Smoke、安全、性能和AI协议Eval纳入永久门禁。
- Performance生成成功工件；Linux CI完成2K写作/自动保存、5000字Diff和156万字符FTS结构化测量。

### 当前验收边界

- 自动化代码闭环与结构化性能证据绑定上述产品Head，阶段记录进入`docs/test-evidence/M8-02/`。
- Candidate现有列表合同按章节读取，StatusArbiter当前只统计继续写作章节；全项目Candidate聚合尚未完成。
- Recovery现有Overview不提供失败备份账本，历史备份失败无法可靠进入全局仲裁；不得用空结果冒充成功。
- Linux CI受Ubuntu/AppArmor限制，功能冒烟使用显式CI-only无沙箱回退；生产sandbox安装配置仍Blocked。
- 真实Provider账号与多模型质量矩阵、完整真实AI Electron单链路、物理混合DPI/多屏、人工读屏/输入法、代码签名/公证、安装/升级/卸载仍Blocked。
- 真实超大DOCX、中央目录与本地Header字段级交叉验证、多进程备份幂等、长期运行和Renderer帧率报告仍未完成。
- 因存在发布级Blocked，当前结论为`禁止发布`，任务保持`In Progress`，PR保持Draft。

## 测试与证据

必须执行并保存真实结果：

- Workspace与Boundary
- Prettier、ESLint、TypeScript
- Unit、Integration、Migration、Coverage
- Security、Performance、AI Eval
- Build、Package Smoke、跨平台打包
- Electron E2E与人工P0路径
- Evidence、PR Policy、Task Governance

证据保存到：`docs/test-evidence/M8-02/`。

Evidence必须记录环境、设备、平台、Fixture规模、真实运行编号、失败与Blocked原因。不得沿用M4-04阶段Head或将未执行项写成成功。

## 完成条件

- M4-04保持Implemented或Verified，不被回写。
- 首次使用、统一工作台、主题、无障碍和显示矩阵完成。
- 安全、隐私、Migration、恢复和凭据边界通过。
- 性能预算、完整Electron E2E和真实AI Eval通过或明确Blocked。
- Windows、macOS、Linux真实工件验收完成。
- P0矩阵、功能目录、追踪矩阵、README、发布与恢复文档与代码一致。
- 最终Evidence绑定实际产品Head和可达main提交。
- 无P0未解释阻断后，任务才可转Ready并关闭。
