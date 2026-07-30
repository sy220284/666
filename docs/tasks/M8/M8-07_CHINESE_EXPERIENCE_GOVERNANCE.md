# M8-07 中文作者体验治理闭环与产品发布验收硬化

> 状态：In Progress  
> 里程碑：M8 长期维护  
> 优先级：P0  
> 正式分支：`work/m8-07-chinese-experience-governance`

## 目标

在不修改作品权威数据模型、不降低既有安全边界、不改写历史验证记录的前提下，完成中文作者体验的最后治理闭环：正式术语唯一化、错误与状态作者化、深色主题和实际内容宽度响应、真实中文输入法验收、机器可读产品验收状态，以及产品验收与发布资格的强绑定。

本任务承接2026-07-30全量代码深度审计确认的开放缺口。M8-04、M8-05、M8-06历史Evidence保持冻结；后续修复、测试和证据全部归入M8-07。

## 问题基线

### P1

1. 任务Verified与产品验收条目脱节，发布门只能证明治理记录自洽。
2. 正式中文名称门禁只禁止少量英文内部词，无法阻止旧中文同义词、动态错误码和内部状态进入作者界面。
3. 作者错误组件和错误映射没有形成统一调用链，正常路径与故障恢复路径仍直接显示错误码、`Core`和内部健康状态。
4. 深色主题变量定义在`body`，根元素已计算文字颜色没有完整切换，造成深色页面低对比度。
5. 写作工作台依据视口断点而非实际内容宽度响应，在主导航占宽后仍可能保持三栏并挤压正文、目录和工具栏。

### P2

1. 未知状态直接回退为内部枚举。
2. 简明模式持续显示保存序号，违反“默认不显示”规则。
3. 中文字体栈、字距、禁用与等待状态语义仍不统一。
4. 中文输入法目前只有composition模拟证据，缺少真实操作系统输入法验收。

## 实施范围

### 1. 作者语言真源

- 扩展正式中文名称门禁，覆盖全部作者可见Renderer、运行时恢复层及主进程/预加载返回的展示文本。
- 增加禁止中文同义词和技术泄漏规则。
- 普通视图禁止原始错误码、内部状态枚举、对象标识和工程名称。
- 技术信息只允许进入明确折叠的技术详情。

### 2. 错误与状态展示

- 建立唯一的Bridge错误→作者错误模型→作者提示组件调用链。
- 写作、设定、规划、检查、设置、恢复和本地服务故障页面统一接入。
- 未知状态显示“状态未知”，原始值只保留在技术详情和日志。
- 简明模式隐藏保存序号，完整模式按需显示。

### 3. 深色主题、中文排版与响应式

- 修复根元素和`body`主题变量继承关系。
- 清理绕过Design Token的固定浅色值。
- Theme A/B浅色与深色均建立可重复视觉证据。
- 写作、历史版本和建议稿页面改用容器查询，按实际工作区宽度折叠右栏和目录。
- 建立明确中文界面字体栈，清理中文标签无意义的大写转换和过度字距。

### 4. 中文输入与无障碍

- 保留composition自动化测试。
- 增加Windows真实中文输入法验收记录；可用设备上增加macOS系统拼音验收。
- 覆盖候选词、回车确认、中英文切换、撤销重做、自动保存、切章、沉浸模式和关闭恢复。
- 验证键盘焦点、状态播报和错误技术详情展开顺序。

### 5. 机器化产品验收与发布门

- 新增机器可读UI/中文体验验收状态文件。
- P0/P1验收项必须具有状态、受检提交和证据。
- 开放P0/P1、缺失证据、不可达Evidence或过期风险豁免均阻断发布。
- Markdown标题、复选框或任务Verified不得单独构成发布资格。

## 非目标

- 不建设云存储、云同步、账号或WorldForge自有云端AI服务。
- 不修改数据库Schema或Migration。
- 不重写M8-04、M8-05、M8-06历史Evidence。
- 不增加签名、公证、安装器、自动更新或第三方公开分发能力。
- 不改变AI只能生成建议、作者拥有正文和权威设定最终裁决权的边界。

## 主要影响范围

- `apps/desktop/renderer/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `packages/contracts/`
- `packages/testkit/`
- `scripts/check-author-language.mjs`
- `scripts/release-tool.mjs`
- `scripts/task-control-lib.mjs`
- `scripts/ui-acceptance-gate.mjs`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/performance/`
- `tests/e2e/`
- `.github/governance/`
- `.github/workflows/`
- `docs/contracts/`
- `docs/product/`
- `docs/ui/`
- `docs/testing/`
- `docs/process/`
- `docs/tasks/`
- `docs/test-evidence/M8-07/`
- `README.md`
- `CHANGELOG.md`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

## 禁止范围

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

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/ACTIVE_TASK.json`
- `docs/tasks/TASK_INDEX.md`
- `docs/tasks/M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md`
- `docs/tasks/M8/M8-05_RUNTIME_HARDENING_DOCUMENTATION_SYNC.md`
- `docs/tasks/M8/M8-06_RELEASE_QUALIFICATION_GOVERNANCE.md`
- `docs/product/AUTHOR_LANGUAGE_GLOSSARY.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`
- `docs/ui/ACCESSIBILITY.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/process/RELEASE_QUALIFICATION.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`

## 验收出口

### 语言与错误

- 作者主路径禁止词扫描为0。
- 普通视图原始错误码为0。
- 普通视图未知内部枚举为0。
- 作者错误入口覆盖全部核心页面和本地服务恢复路径。

### 视觉与布局

- Theme A浅色、深色通过。
- Theme B浅色、深色通过。
- 1280×800核心流程无整页横向滚动和操作遮挡。
- 1440宽度下写作目录无逐字纵向换行，正文仍为视觉中心。
- 历史版本、建议稿和差异页无布局阻断。

### 输入与无障碍

- composition自动化测试通过。
- Windows真实中文输入法验收通过。
- macOS验收在可用设备上完成；无法执行时必须明确记录，不得伪造通过。
- 键盘焦点、状态播报和技术详情展开可用。

### 治理与发布

- 机器验收状态中全部P0/P1为PASS。
- 开放P0/P1缺陷为0。
- 所有证据绑定当前受检提交并可从发布提交到达。
- 主线验证成功，延期账本为空。
- `pnpm release:gate`仅在上述条件同时满足后返回READY。

## 测试与验证

- `pnpm check:language`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:security`
- `pnpm test:perf`
- `pnpm test:e2e`
- `pnpm release:check`
- `pnpm build`

## 状态规则

当前状态为In Progress。只有代码、测试、视觉证据、真实输入法验收、机器验收状态、受控合并和Main Verification全部闭环后，才允许转为Implemented并最终关闭为Verified。
