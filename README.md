# WorldForge（创世工坊）

WorldForge 是一款面向单作者长篇网文创作的本地优先 AI 写作工作站。

核心原则：

- 所有作品、数据库、索引、日志、备份和配置仅保存在用户本地。
- AI 仅通过用户自行配置的模型 API 或已在本地运行的兼容服务接入。
- AI 输出先进入候选稿，未经作者确认不得覆盖当前正文。
- SQLite 是项目唯一数据真源。
- Draft、Candidate、Version 三层分离，支持锁定、撤销、回滚和审计。

## 当前状态

仓库处于方案冻结与工程初始化阶段，当前基线为 **WorldForge V6.5**。

## 文档

- `docs/specs/WorldForge_V6.5_最终工程设计文档.docx`：产品、架构、功能、UI、安全、并发、高分屏和验收的完整冻结方案。
- `docs/development/WorldForge_Codex_全流程技术开发指南.md`：指导 Codex 从架构初始化到开发、测试、审查、验收和发布的全流程执行文档。
- `AGENTS.md`：Codex 仓库级强制执行规则。
- `agent.md`：兼容副本，以 `AGENTS.md` 为权威。

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

## 许可证

当前方案基线采用 AGPL-3.0。正式发布前将结合第三方集成与分发策略再次完成许可证审查。
