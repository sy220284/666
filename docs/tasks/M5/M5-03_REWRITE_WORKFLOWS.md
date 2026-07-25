# M5-03 快速改写与结构性改写

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`work/m5-03-rewrite-workflows`

## 目标

实现高频单段快速改写和跨段/跨场景结构性改写，保持所有AI结果可持久化、可预览、可冲突处理和可撤销。

## 阶段定位

完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。所有改写继续复用M4运行时与M2-03采用引擎。

## 非目标

- 不允许模型直接替换选区。
- 不新增未经请求的剧情事件。
- 不让快速改写结果只存在于Renderer内存。
- 不重写Candidate、Diff、ConflictSet、ApplyRecord或LockGuard。
- 不增加逐字符Candidate采用语义；段内选区最终仍转换为完整块Patch。

## 依赖

M5-02、M2-03

## 关联

- 需求：REQ-027
- 功能ID：AI-006、AI-007
- 验收：P0-027、P0-028

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/tasks/M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md`
- `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md`
- `docs/tasks/M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md`

## 主要影响范围

- `packages/prompts/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`

## 段内选区锚点合同

```text
RewriteSelectionAnchor
├─ projectId
├─ chapterId
├─ draftId
├─ baseRevision
├─ logicalBlockId
├─ expectedBlockHash
├─ selectionStart
├─ selectionEnd
└─ selectedTextHash
```

模型只返回选区替换文本。Core必须以权威原块和锚点重建完整候选块；应用时仍使用M2-03完整块Patch、Revision、Hash、LockGuard、ConflictSet和ApplyRecord。范围、原文或Hash变化时禁止静默重定位。

## 实施内容

1. 快速改写输入受控段内选区、同段全文、邻段语境、任务指令和最小约束；选区使用正式锚点合同，不传递Renderer临时位置作为权威值。
2. Core在调用前验证项目、章节、Draft、Revision、块Hash、选区边界和选中文本Hash；选区含锁定内容时禁止并解释。
3. 每次快速改写完成后先创建持久化`rewrite` Prose Candidate；Candidate保存完整重建后的块语义，Renderer内联预览只是展示。
4. “换一个”创建新的GenerationRun和Candidate，保留同一用户指令、选区锚点和来源关系；取消不得污染Draft。
5. 内联预览支持换一个、取消、应用和整体撤销，用户术语、状态和错误表达遵循M5-00。
6. 应用前再次验证Revision、块Hash、选区原文和LockGuard；任一变化进入ConflictSet，不静默覆盖或猜测重定位。
7. 范围超过轻量阈值、跨多个正文块或改变结构时自动升级为结构性`rewrite` Candidate，并保留用户原始指令。
8. 结构性改写支持跨段、跨SceneBeat和整章，完整记录`baseRevision`、来源块、SceneBeat和GenerationRun。
9. 后置校验限制新增事件、专名漂移、视角/时态变化和设定冲突；结果只提示风险。
10. 应用严格复用M2-03 Diff、ConflictSet、完整块Patch、LockGuard、Checkpoint和ApplyRecord。
11. 取消、流式、partial和重启查询复用M4-05，不建立改写专属运行状态机。

## 测试与证据

- 单段选区、同段全文、跨段、锁定、Revision变化、块Hash变化、选区文本变化、取消、换一个、持久化Candidate和撤销。
- Unicode、中文组合输入、代理对和换行边界下的选区位置与文本Hash。
- Renderer卸载或重启后快速改写结果仍可从Candidate历史读取。
- 不新增事件、专名/视角/时态保持Fixture。
- 升级结构性流程不丢用户指令、选区锚点、来源和基础Revision。
- 选区应用最终生成完整块Patch，不引入逐字符采用旁路。
- 应用全程复用M2-03事务，失败不改变Draft。

证据保存到：`docs/test-evidence/M5-03/`

## 完成条件

- 快速操作不绕过Candidate隔离和代码硬保证。
- 任一可展示AI改写结果均有持久化Candidate与GenerationRun来源。
- 段内选区在Core中可精确复核并转换为完整块Patch，过期时只进入冲突。
- 结构性改写与普通Candidate采用一致。
- UI遵循M5-00建立的作者语言与工作台状态规范。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、UI、安全或测试文档。
