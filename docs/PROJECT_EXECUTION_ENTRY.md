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

作者最新指令明确采用两段交付：

```text
M4-04
└─ C0—C7与C1并发硬化
   → Ready永久门禁
   → 受控合并main
   → Implementation Hold

M8-02
└─ C8完整体验、硬化、真实平台验收与发布关闭
   → 作者已于2026-07-28明确启动
   → 独立任务分支与Draft PR
   → 最终发布验收
```

M4-04吸收原M4-05、M5-00—M5-06和M6-01—M6-06。原M7-01—M7-03、M8-01和M8-03改由M8-02吸收。

C8延期不代表删除，也不允许用M4-04阶段结果代替最终发布验收。

## 3. 当前执行模式

```text
活动任务：M8-02
正式分支：work/m8-02-performance-e2e-ai-eval
授权模式：implementation-pr
自动激活下一任务：关闭
前置任务：M4-04（Implemented）
```

M4-04已完成Implementation Hold；作者明确启动M8-02后：

- `TASK_INDEX`保持M4-04为Implemented。
- `ACTIVE_TASK.activeTask`切换为M8-02 `IN_PROGRESS`。
- `lastImplementedTask`继续保留M4-04真实产品提交、Evidence与原延期原因。
- `deferredVerification`继续登记M4-04，等待最终批次关闭。
- M8-02使用独立正式分支和独立PR，不复用已合并的M4-04 PR。

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

### M4-04：V1核心功能

- C0整体规划与审计。
- C1作者工作流、继续写作与并发硬化。
- C2 GenerationRun与生产Prompt。
- C3 T0/T1与结构化Candidate。
- C4改写、融合、审阅与安全采用。
- C5状态提取、Validation与Todo/Comment。
- C6搜索替换、写作统计与节奏。
- C7 DOCX与三轨备份恢复。

Evidence：`docs/test-evidence/M4-04/`。

### M8-02：延期C8

- 首次使用向导与三条创作路径。
- 统一工作台最终体验和StatusArbiter。
- Theme A/B、无障碍和显示矩阵。
- 安全、性能、Electron E2E与AI Eval终验。
- Windows、macOS、Linux构建、安装、升级和卸载。
- P0总验收、发布判断与最终Verified关闭。

Evidence：`docs/test-evidence/M8-02/`。

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
