# WorldForge 文档索引

## 冻结方案

V6.5完整方案按章节拆分为三份Markdown文件，便于GitHub浏览和后续版本审查：

1. `specs/WorldForge_V6.5_最终工程设计方案_01_基础架构与核心功能.md`
2. `specs/WorldForge_V6.5_最终工程设计方案_02_UI交互与基础闭环.md`
3. `specs/WorldForge_V6.5_最终工程设计方案_03_视觉记忆安全与高分屏.md`

高分屏、2K与曲面/超宽屏适配示意图位于：

- `assets/display_adaptation.png`

## 开发执行

- `development/WorldForge_Codex_全流程技术开发指南.md`：从仓库初始化、架构实现、里程碑开发、测试、审查到最终验收的完整执行文档。
- `/AGENTS.md`：Codex自动读取的仓库级强制规则。
- `/agent.md`：兼容副本，根目录`AGENTS.md`为权威。

## 文档优先级

```text
作者最新明确指令
> 已批准任务卡
> V6.5冻结方案与P0验收
> AGENTS.md
> Codex全流程技术开发指南
> 现有代码实现
```

方案变更必须同步更新设计文档、任务卡、数据契约和验收标准，禁止只改代码不改文档。
