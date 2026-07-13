# WorldForge（创世工坊）

WorldForge 是一款面向单作者长篇网文创作的本地优先 AI 写作工作站。

核心原则：

- 所有作品、数据库、索引、日志、备份和配置仅保存在用户本地。
- AI 仅通过用户自行配置的模型 API 或已在本地运行的兼容服务接入。
- AI 输出先进入候选稿，未经作者确认不得覆盖当前正文。
- SQLite 是项目唯一数据真源。
- Draft、Candidate、Version 三层分离，支持锁定、撤销、回滚和审计。

## 当前状态

仓库已完成 **V6.5方案、P0工程文档与UI实施规格初始化**，尚未开始可运行代码工程初始化。当前基线为 **WorldForge V6.5**。

## 权威文档

- [`WorldForge_V6.5_实施安全并发与高分屏适配冻结最终工程设计文档.docx`](./WorldForge_V6.5_实施安全并发与高分屏适配冻结最终工程设计文档.docx)：完整产品与工程设计方案。
- [`WorldForge_Codex_全流程技术开发指南.md`](./WorldForge_Codex_全流程技术开发指南.md)：Codex架构、开发、测试、审查和验收全流程。
- [`AGENTS.md`](./AGENTS.md)：仓库级强制执行规则。
- [`docs/INDEX.md`](./docs/INDEX.md)：全部工程文档索引与维护规则。

仓库不保留拆分版设计方案或拆分版Codex指南。

## P0工程文档

- [`docs/product/V1_SCOPE_AND_ACCEPTANCE.md`](./docs/product/V1_SCOPE_AND_ACCEPTANCE.md)：V1.0范围和关闭条件。
- [`docs/product/FUNCTION_CATALOG.md`](./docs/product/FUNCTION_CATALOG.md)：功能设计、效果、实现方式、关系与交互明细。
- [`docs/product/V1.0_TRACEABILITY_MATRIX.md`](./docs/product/V1.0_TRACEABILITY_MATRIX.md)：需求、任务和验收追踪。
- [`docs/roadmap/V1.0_ROADMAP.md`](./docs/roadmap/V1.0_ROADMAP.md)：M0—M5路线图。
- [`docs/ui/README.md`](./docs/ui/README.md)：UI、页面、编辑器、候选、引导、高分屏与无障碍规格索引。
- [`docs/decisions/README.md`](./docs/decisions/README.md)：五项核心ADR。
- [`docs/database/DATABASE_SCHEMA.md`](./docs/database/DATABASE_SCHEMA.md)：数据库Schema。
- [`docs/contracts/IPC_CONTRACTS.md`](./docs/contracts/IPC_CONTRACTS.md)：IPC命令契约。
- [`docs/ai/LOCAL_AI_SERVICE_SPEC.md`](./docs/ai/LOCAL_AI_SERVICE_SPEC.md)：本地与外部AI端点接入边界。
- [`SECURITY.md`](./SECURITY.md)：安全策略。
- [`docs/testing/P0_ACCEPTANCE_MATRIX.md`](./docs/testing/P0_ACCEPTANCE_MATRIX.md)：P0验收矩阵。
- [`docs/tasks/TASK_INDEX.md`](./docs/tasks/TASK_INDEX.md)：M0—M5任务卡索引。

## UI实施规格

- [`UI_SYSTEM.md`](./docs/ui/UI_SYSTEM.md)：安静编辑部视觉系统与Design Token。
- [`INFORMATION_ARCHITECTURE.md`](./docs/ui/INFORMATION_ARCHITECTURE.md)：六个一级入口和三个核心工作台。
- [`SCREEN_SPECIFICATIONS.md`](./docs/ui/SCREEN_SPECIFICATIONS.md)：全部核心页面规格。
- [`EDITOR_INTERACTION_SPEC.md`](./docs/ui/EDITOR_INTERACTION_SPEC.md)：中文编辑、锁定、保存、撤销和快速改写。
- [`CANDIDATE_REVIEW_SPEC.md`](./docs/ui/CANDIDATE_REVIEW_SPEC.md)：候选比较、融合、采用、冲突和回退。
- [`RESPONSIVE_AND_DPI.md`](./docs/ui/RESPONSIVE_AND_DPI.md)：1280×800、2K、21:9曲面屏和混合DPI。
- [`UI_ACCEPTANCE_CHECKLIST.md`](./docs/ui/UI_ACCEPTANCE_CHECKLIST.md)：UI专项验收与发布阻断项。

## 目标技术栈

- Electron + React + TypeScript
- Tiptap + ProseMirror
- SQLite + better-sqlite3 + FTS5
- Zustand + Zod
- Vitest + Playwright
- pnpm workspace

## 版本范围

### V1.0

完成本地项目、块级编辑、Draft/Candidate/Version、人物设定、大纲场景、AI候选、连续性、搜索校对、备份恢复和导入导出等核心写作闭环。

### V1.5

在真实长篇项目验证后，再实施完整分层记忆、卷级连续性检查点、定时 AI 项目日记、超长篇压力适配和条件性语义检索。

## 下一步

按照[`docs/tasks/M0_TASKS.md`](./docs/tasks/M0_TASKS.md)执行`M0-01 Monorepo与质量工具`，开始可运行工程初始化。

## 许可证

当前方案基线采用 AGPL-3.0。正式发布前将结合第三方集成与分发策略再次完成许可证审查。
