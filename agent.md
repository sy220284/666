# WorldForge Agent 工作入口

> 本文件供人工和通用 AI Agent 快速查看。根目录 `AGENTS.md` 是仓库级权威指令；本文件必须与其核心规则保持一致。

## 1. 开始工作时先读什么

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK 指向的独立任务卡
→ 任务卡列出的专项文档
→ 现有代码、测试、Migration、IPC 和追踪矩阵
```

`ACTIVE_TASK.json` 是机器真源，`ACTIVE_TASK.md` 是生成镜像。当前采用 `implementation-pr` 模式：每张任务在独立非 `main` 的正式任务集成分支完成真实实现，经 PR Policy、Task Governance、Security、Performance、Evidence 与 Quality 门禁通过并由 Controlled Merge 合并后，再按 `ACTIVE_TASK.authorization` 决定自动推进或暂停。任一代码、测试、安全、数据、Migration 或来源验证失败都必须阻断。

## 2. V1.0 任务阶段

```text
M0 工程、安全与运行底座
→ M1 基础写作 MVP
→ M2 编辑安全与版本核心
→ M3 规划、设定与连续性
→ M4 检索与 AI 基础设施
→ M5 AI 生成与 Candidate 审阅
→ M6 校验、搜索与交付
→ M7 完整 UI 与体验整合
→ M8 发布硬化与验收
```

共 52 张独立任务卡，详见 `docs/tasks/TASK_INDEX.md`。

M1 必须先交付无 AI 基础产品：

```text
创建项目
→ 建卷建章
→ 中文写作
→ 自动保存
→ 字数与当前章查找
→ 手动 Version 与定稿
→ TXT/Markdown 导入导出
→ 只读与恢复副本
```

基础产品未完成时，不得将后期 Prompt、AI Schema、人物弧光或主题骨架视为主线完成度。M3-07 至 M3-10 必须在 M4 前完成 Renderer React/Tiptap/Zustand 架构迁移，M7不承担基础框架重写。

## 3. 文档入口

| 问题 | 文档 |
|---|---|
| 完整产品、架构和边界 | `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md` |
| 不知道该查什么 | `docs/PROJECT_EXECUTION_ENTRY.md` |
| 当前允许做什么 | `docs/tasks/ACTIVE_TASK.json`、`docs/tasks/ACTIVE_TASK.md` |
| 全部任务与顺序 | `docs/tasks/TASK_INDEX.md` |
| 路线图 | `docs/roadmap/V1.0_ROADMAP.md` |
| 功能如何设计 | `docs/product/FUNCTION_CATALOG.md` |
| 需求如何映射任务 | `docs/product/V1.0_TRACEABILITY_MATRIX.md` |
| 架构与模块职责 | `docs/architecture/` |
| 数据库与 Migration | `docs/database/` |
| IPC、事件与错误码 | `docs/contracts/` |
| Provider、Prompt 与 Eval | `docs/ai/` |
| UI 与交互 | `docs/ui/` |
| 安全与隐私 | `SECURITY.md`、`docs/security/` |
| 测试与验收 | `docs/testing/` |
| 固定实现选择 | `docs/decisions/IMPLEMENTATION_DECISIONS.md` |
| 完整工作闭环 | `docs/process/CODEX_EXECUTION_PLAYBOOK.md` |
| 自动化与主线门禁 | `docs/process/DEVELOPMENT_AUTOMATION.md` |

## 4. 五项硬边界

1. 项目数据、索引、日志、Prompt、Eval 和备份默认只在用户本机。
2. AI 输出先成为 Candidate，未经作者接受不能进入 Draft。
3. `project.sqlite` 是唯一项目数据真源。
4. Lock、Revision、Hash、不可变 Version、项目与路径边界由代码保证。
5. AI 只能提议，作者拥有最终裁决权。

任一边界失败，任务不能通过。

## 5. 标准行动路径

```text
确认活动任务、授权模式与依赖
→ 阅读任务卡和专项文档
→ 检查真实代码、测试、Migration 和最近提交
→ 输出目标、非目标、允许路径、影响和验证计划
→ 先建立失败测试或稳定复现
→ 完成最小端到端实现和最小 UI
→ 覆盖失败、取消、冲突、只读和恢复
→ 运行必要专项测试
→ 独立复查
→ 同步文档、追踪矩阵和任务状态
→ 保存文本 Evidence
→ 登记 Implemented 或完成 Verified
→ 受控合并并验证 main
→ 按 authorization 自动推进或暂停
```

## 6. 同任务并行规则

允许同一活动任务内开发、测试、审查和文档并行，但不允许并行任务或多个正式PR：

```text
一个正式任务集成分支
├─ 开发工作区或辅助分支
├─ 测试工作区或辅助分支
└─ 审查/文档工作区或辅助分支
        ↓
统一汇入正式任务集成分支
        ↓
一个 Ready PR
        ↓
一个受检 Head
```

规则：

- 辅助分支不得直接向 `main` 开普通任务 PR。
- 只能有一个正式任务 PR 和一个最终受检 Head。
- 开发、测试和审查可并行；集成、Ready 门禁、合并和状态推进必须串行。
- `package.json`、锁文件、任务状态、Evidence Manifest 和共享入口文件由集成负责人统一修改。
- 最终 E2E、Evidence 提交绑定和 Verified 关闭必须在代码与测试汇合后完成。

## 7. 当前版本不做

- 云存储、云同步、账号后台或托管后端。
- WorldForge 请求代理。
- 模型下载、安装、容器、GPU 或运行时管理。
- 向量数据库、Embedding 和 Rerank。
- MCP、多人协作、CRDT 或插件市场。
- 自动发布、读者运营或偏好学习。
- 无人审核批量生成。
- 社区、成就或商业系统。

## 8. Implemented、Verified 与主线闭环

### 可登记 Implemented

- 真实实现存在于 PR Head；
- 必要专项测试和永久 Ready 门禁通过；
- Migration、契约、UI 和文档按影响范围同步；
- 不存在 TODO、空实现、固定假数据和伪造成功；
- 延期最终验证已登记。

在 implementation-first 模式中，`Implemented` 可以满足同阶段后续编码依赖，但不能满足阶段关闭、发布或最终验收。

### 可登记 Verified

- 最终四文件 Evidence 完整；
- `manifest.commit` 绑定 Squash 后可达的 `mainCommit`；
- `implementationHead` 与 `mainCommit` 的 Tree SHA 一致；
- 任务或里程碑最终验收完成；
- `TASK_INDEX`、任务卡、追踪状态和 ACTIVE_TASK 一致。

### 可声明主线闭环

- 受检 Head 的永久门禁真实通过；
- Controlled Merge 已实际完成；
- Main Verification 已成功；
- 必要状态已进入 `main`；
- 已重新读取真实 `main` 和关键文件确认结果。

`authorization.autoActivateNext=true` 且依赖满足时，可自动推进下一张任务；为 `false`、作者明确暂停或存在阻断项时，必须等待指令。

## 9. Evidence

新任务 Evidence 只强制：

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

- `summary.md`记录实现范围、实际测试结果、必要人工复核和质量结论。
- `commands.txt`只记录真实执行过的命令和结果。
- `known-risks.md`记录剩余风险，无风险时明确写“无”。
- `manifest.json`绑定文件完整性和来源提交。
- 不要求截图、截图清单、单独人工验收文件或单独质量矩阵。
- 不得为了闭环专门生成用户不查看的截图或 Artifact。
- 旧 Evidence 可保留 Manifest 中登记的历史附加文件。

来源绑定：

```text
实施验证绑定受检 PR Head
最终 Evidence 的 manifest.commit 绑定 Squash 后可达的 mainCommit
通过 implementationHead 与 mainCommit 的 Tree SHA 一致性证明内容等同
```

默认不生成截图。只有在定位真实 UI 故障且文字、日志或自动化结果不足时，才按风险保留截图；截图不是统一强制 Evidence 文件。

## 10. 开发端与自动工作流边界

```text
任务卡定义目标
→ 开发执行端修改正式源码
→ 正式文件提交到任务集成分支
→ PR Head成为唯一实现真源
→ 通用工作流验证该Head
→ Controlled Merge受控合并
→ Main Verification验证main来源与静态一致性
```

固定规则：

1. 连接器、本地工作区或作者批准的编码环境负责需求分析、正式源码、Migration、契约、UI、测试、文档、任务状态和提交。
2. 单文件修改可使用 Contents API；涉及两个及以上正式文件时，必须优先使用 Git Blob/Tree/Commit 生成单个原子提交，禁止连续逐文件提交形成可见中间态。
3. 禁止为规避连接器或锁文件限制创建一次性、任务专属或分支专属 Workflow 来生成、改写或提交正式代码、锁文件、测试、文档和任务状态。
4. 每次写入前必须确认仓库、目标分支、main SHA、任务 ID 和 `allowedPaths`；不得依赖默认分支执行写操作。
5. 原子提交后必须重新读取真实 PR Head 中的关键文件，确认出口、接线、测试、文档和任务状态确已落盘。
6. 永久工作流只能提供仓库级通用能力：PR Policy、Task Governance、Evidence、Security、Performance、Quality、Controlled Merge、Main Verification 和通用 Diagnostics。
7. 禁止创建绑定单个任务编号、分支或功能的 Runner、Generator、Diagnostic Workflow 及 `.github/<TASK-ID>/apply-*` 补丁目录。
8. CI 只验证已提交代码，并按需生成构建、测试、覆盖率、安全、性能、E2E、日志和状态报告；不得在临时工作树生成正式 TypeScript、SQL、IPC、Renderer、测试、任务卡或产品文档后直接作为合并依据。
9. 正式门禁测试前后必须保持工作树干净：

```bash
git diff --exit-code
test -z "$(git status --porcelain)"
```

10. 六类永久门禁必须对应同一未变化 Head；只允许 Controlled Merge 合并，Main Verification 成功后才能宣布主线闭环。
11. Schema 当前版本从有序 Migration 序列自动派生，生产代码、Manifest、恢复点、Migration 测试和 Security 测试不得写死当前版本号。
12. 发现 CI 生成的正式源码不在 PR Head、任务专属 Workflow 增加、临时脚本压过正式实现、不同门禁验证不同 Tree、任务/Evidence 状态不一致或误写 `main` 时，必须立即停止，从最新 `main` 重建干净任务分支。
