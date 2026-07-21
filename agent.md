# WorldForge Agent工作入口

> 本文件供人工和通用AI代理快速查看。Codex仓库级权威指令文件是根目录`AGENTS.md`。

## 1. 开始工作时先读什么

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK指向的独立任务卡
→ 任务卡列出的专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

`ACTIVE_TASK.json`是机器真源，`ACTIVE_TASK.md`是其镜像。当前作者已授权`implementation-pr`模式：每张任务在独立非`main`分支完成真实实现，经PR Policy、Task Governance、Security、Performance、Evidence与Quality门禁通过并受控合并后，才可顺序推进；失败时必须阻断。

## 2. V1.0任务阶段

```text
M0 工程、安全与运行底座
→ M1 基础写作MVP
→ M2 编辑安全与版本核心
→ M3 规划、设定与连续性
→ M4 检索与AI基础设施
→ M5 AI生成与候选审阅
→ M6 校验、搜索与交付
→ M7 完整UI与体验整合
→ M8 发布硬化与验收
```

共52张独立任务卡，详见`docs/tasks/TASK_INDEX.md`。

M1必须先交付无AI基础产品：

```text
创建项目
→ 建卷建章
→ 中文写作
→ 自动保存
→ 字数与当前章查找
→ 手动版本与定稿
→ TXT/Markdown导入导出
→ 只读与恢复副本
```

基础产品未完成时，不得将后期Prompt、AI Schema、人物弧光或主题骨架视为主线完成度。M3-07—M3-10在M4前完成Renderer React/Zustand架构迁移，M7不承担基础框架重写。

## 3. 文档入口

| 问题 | 文档 |
|---|---|
| 完整产品、架构和边界 | `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md` |
| 不知道该查什么 | `docs/PROJECT_EXECUTION_ENTRY.md` |
| 当前允许做什么 | `docs/tasks/ACTIVE_TASK.md` |
| 全部任务与顺序 | `docs/tasks/TASK_INDEX.md` |
| 路线图 | `docs/roadmap/V1.0_ROADMAP.md` |
| 功能如何设计 | `docs/product/FUNCTION_CATALOG.md` |
| 需求如何映射任务 | `docs/product/V1.0_TRACEABILITY_MATRIX.md` |
| 架构与模块职责 | `docs/architecture/` |
| 数据库与Migration | `docs/database/` |
| IPC、事件与错误码 | `docs/contracts/` |
| Provider、Prompt与Eval | `docs/ai/` |
| UI与交互 | `docs/ui/` |
| 安全与隐私 | `SECURITY.md`、`docs/security/` |
| 测试与验收 | `docs/testing/` |
| 固定实现选择 | `docs/decisions/IMPLEMENTATION_DECISIONS.md` |
| 完整工作闭环 | `docs/process/CODEX_EXECUTION_PLAYBOOK.md` |

## 4. 五项硬边界

1. 项目数据、索引、日志和备份默认只在用户本机。
2. AI输出先成为Candidate，未经作者接受不能进入Draft。
3. `project.sqlite`是唯一项目数据真源。
4. 锁定、Revision、Hash、不可变Version、项目与路径边界由代码保证。
5. AI只能提议，作者拥有最终裁决权。

任一边界失败，任务不能通过。

## 5. 标准行动路径

```text
确认活动任务与依赖
→ 阅读任务和专项文档
→ 检查真实代码与测试
→ 输出目标、非目标、路径和验证计划
→ 先建立失败测试或稳定复现
→ 完成最小端到端实现和最小UI
→ 覆盖失败、取消、冲突、只读和恢复
→ 运行测试
→ 独立复查
→ 同步文档和追踪矩阵
→ 保存证据
→ 关闭任务并等待下一指令
```

## 6. 当前版本不做

- 云存储、云同步、账号后台。
- 模型下载、安装和运行时管理。
- 向量数据库、Embedding和Rerank。
- 多人协作、CRDT、插件市场。
- 自动发布、读者运营和偏好学习。
- 无人审核批量生成。

## 7. 完成标准

只有同时满足以下条件才能汇报完成：

- 前置依赖已Verified。
- 功能真实接通且有最小可操作UI。
- 成功和主要失败路径可运行。
- 测试真实执行并记录。
- 数据、IPC、UI、安全和文档一致。
- `TASK_INDEX`与追踪矩阵已更新。
- 证据位于`docs/test-evidence/<TASK-ID>/`。
- 没有TODO、空实现、固定假数据和伪造成功。

任务关闭后不得自动继续下一项。

## 8. 开发端与自动工作流边界

```text
任务卡定义目标
→ 开发执行端读取并修改正式源码
→ 正式文件真实提交到任务分支
→ PR Head成为唯一实现真源
→ 通用工作流验证该Head
→ Controlled Merge受控合并
→ Main Verification验证main
```

固定规则：

1. 连接器、本地工作区或作者批准的编码环境负责需求分析、正式源码、Migration、契约、UI、测试、文档、任务状态和提交。
2. 无法`git clone`时，单文件修改可使用Contents API；涉及两个及以上正式文件时，必须优先使用Git Blob/Tree/Commit生成单个原子提交，禁止连续逐文件提交形成可见中间态。
3. 禁止为规避连接器或锁文件限制创建一次性、任务专属或分支专属Workflow来生成、改写或提交正式代码、锁文件、测试、文档和任务状态；只能复用已经合入`main`并通过治理门禁的永久受控流程。
4. 每次写入前必须确认仓库、目标分支、main SHA、任务ID和`allowedPaths`；不得依赖默认分支执行写操作。
5. 原子提交后必须重新读取真实PR Head中的关键文件，确认出口、接线、测试、文档和任务状态确已落盘。
6. 永久工作流只能提供仓库级通用能力：PR Policy、Task Governance、Evidence、Security、Performance、Quality、Controlled Merge、Main Verification和通用Diagnostics。
7. 禁止创建绑定单个任务编号、分支或功能的Runner、Generator、Diagnostic工作流及`.github/<TASK-ID>/apply-*`补丁目录。
8. CI只验证已提交代码，并生成构建、测试、覆盖率、安全、性能、E2E、截图、日志和状态报告；不得在临时工作树生成正式TypeScript、SQL、IPC、Renderer、测试、任务卡或产品文档后直接作为合并依据。
9. 正式门禁测试前后必须保持工作树干净：

```bash
git diff --exit-code
test -z "$(git status --porcelain)"
```

10. Evidence必须绑定最终PR Head SHA，只记录针对该提交真实执行的结果。Runner成功、补丁成功、Artifact上传或PR可合并均不能单独证明完成。
11. 六类永久门禁必须对应同一未变化Head；只允许Controlled Merge合并，Main Verification成功后才能宣布主线闭环。
12. Schema当前版本从有序Migration序列自动派生，生产代码、Manifest、恢复点、Migration测试和Security测试不得写死当前版本号。
13. 一旦发现CI生成的正式源码不在PR Head、任务专属工作流增加、临时脚本压过正式实现、JSON/Markdown不同步或误写`main`，必须立即停止，恢复错误分支，从最新main重建干净任务分支后重新提交真实代码。
