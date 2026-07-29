# WorldForge 项目执行统一入口

> 状态：Active  
> 面向：Codex、开发者、审查者、测试人员

## 1. 启动顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ 当前活动任务卡
→ TASK_INDEX列出的依赖与吸收来源
→ 权威规格、现有代码、测试、Migration、IPC与Evidence
```

`ACTIVE_TASK.json`是机器可读真源，`ACTIVE_TASK.md`是生成镜像，`TASK_INDEX.md`是任务状态和归属真源。

## 2. 当前分阶段交付

M4-04与M8-02已经完成V1.0核心功能、自用便携交付和最终验证。作者随后独立启动M8-04，在不重开历史任务和不改变自用发布边界的前提下，统一作者体验与开发协作语言：

```text
M4-04与M8-02 Verified基线
→ M8-04作者体验与开发语言统一
→ PR #227永久门禁
→ 受控合并main
→ Main Verification
→ M8-04 Verified终态保持
```

M8-04复用既有权威数据、服务、保存序号、内容校验、锁定、只读与恢复机制，不建立第二套产品或界面数据真源。

## 3. 当前执行模式

```text
终态锚点：M8-04
正式分支：work/m8-04-author-experience-language
授权模式：implementation-pr
自动激活下一任务：关闭
前置任务：M8-02（Verified）
```

M8-04使用独立正式分支与单一正式PR #227完成实现、测试、文档和验证记录汇合。PR #227已经受控合并，Main Verification成功；当前保留M8-04作为`VERIFIED_HOLD`终态锚点，不自动激活后续任务。

## 4. 权威顺序

```text
作者最新明确指令
> ACTIVE_TASK与TASK_INDEX
> 当前任务卡
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> 冻结专项规格、ADR、Schema、契约、UI、安全与P0验收
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> 现有实现
```

发现冲突时必须记录冲突来源、数据兼容、影响范围和解决方案，禁止静默选择。

## 5. 当前任务边界

### M8-04：作者体验与开发语言统一

- 正式中文名称与界面语言永久门禁。
- 快速开始、继续写作、精准跳转与原位置返回。
- 写作辅助、沉浸写作、结构化设定和前后文管理。
- 建议稿差异审阅、安全采用、AI连接预设、作品检查与整书交付。
- 异步查询防串、关闭前当前稿命名握手和长章节差异性能保护。
- 功能目录、追踪矩阵、任务状态与四件套验证记录同步。

Evidence：`docs/test-evidence/M8-04/`。

## 6. 标准实施闭环

```text
读取任务卡、吸收来源与专项真源
→ 审计代码、测试、Migration、IPC和最近提交
→ 失败测试或稳定复现
→ Contracts / Domain
→ Migration / Repository
→ Core
→ Main / Preload
→ Renderer
→ 失败、取消、冲突、只读、恢复与重启
→ 受影响自动化与人工验收
→ 横向和纵向复查
→ 更新任务、追踪和Evidence
→ Draft转Ready
→ 六项永久门禁全部成功
→ 使用expected_head_sha受控合并
→ 等待main-verification成功
```

任何一个步骤未完成，不得报告“合并完成”或“main已通过”。

## 7. 强制规则

- 不修改已Verified任务卡和历史Migration。
- 不建立第二套Prompt、TaskProtocol、Candidate采用、导入、恢复、模式或主题状态。
- 每项用户功能按实际影响完成Contracts→Core→Main→Preload→Renderer→测试闭环。
- 未接通能力不得显示可用，不得写入半成品权威数据。
- AI输出不得绕过Candidate或StateProposal进入权威数据。
- 无AI写作、保存、Version、导出和恢复始终必须可用。
- 测试、构建、发布和平台结论必须来自真实运行。
- PR Head检查成功不等于main验证成功；合并后必须复核最终main SHA及`main-verification`。
