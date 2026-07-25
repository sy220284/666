# M8-02 性能、E2E、显示与AI Eval验收

> 状态：Planned  
> 里程碑：M8 发布硬化与验收  
> 优先级：P0  
> 建议分支：`work/m8-02-performance-e2e-ai-eval`

## 目标

在真实数据规模、完整业务路径、目标显示环境和支持模型下验证性能、运行真实性与AI质量基线。

## 阶段定位

完成安全、数据、性能、E2E、跨平台构建、P0追踪和发布关闭。M8-02负责跨任务终验，不在未达阈值时无计划重构架构。

## 非目标

- 未达到阈值时不在验收任务内无计划拆进程。
- 不以局部单元测试替代完整Electron链路。
- 不把未验证模型的偶然成功标记为稳定支持。
- 不通过模糊路径在验收卡内实施跨模块重构。

## 依赖

M8-01、M7-03

## 关联

- 需求：REQ-026、REQ-028—REQ-031、REQ-041、REQ-045、REQ-046
- 功能ID：无
- 验收：P0-023—P0-029、P0-044、P0-063—P0-066、P0-071—P0-074

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`
- `docs/tasks/M5/M5-01_T0_SKELETON.md`
- `docs/tasks/M5/M5-06_STATE_EXTRACTION_PROPOSAL_INTEGRATION.md`
- `docs/tasks/M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md`

## 主要影响范围

- `tests/performance/`
- `tests/e2e/`
- `tests/integration/`
- `tests/security/`
- `evals/`
- `docs/test-evidence/M8-02/`
- `docs/testing/`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `packages/contracts/`（仅修复已定位的验收合同缺陷）
- `packages/core-service/`（仅修复已定位的局部性能或结果一致性缺陷）
- `apps/desktop/main/`（仅修复已定位的IPC、任务或性能缺陷）
- `apps/desktop/preload/`（仅与Main修复同步）
- `apps/desktop/renderer/`（仅修复已定位的显示、订阅或性能缺陷）

任何需要新进程、重写状态机、重构Candidate/GenerationRun或大范围UI架构的缺陷必须转独立`fix/`任务并阻断M8-02关闭。

## 实施内容

1. 验证2K键入P95≤50ms、自动保存P95≤150ms、编辑IPC P95≤200ms。
2. AI取消反馈≤500ms；取消后未来delta进入Renderer数量必须为0，迟到结果不得污染当前任务状态。
3. 验证5000字Diff首屏≤500ms、完整≤1.2s，正文滚动≥50fps，Core单次事件循环阻塞<100ms。
4. 记录FTS查询/重建、长章节、百万字、多任务、候选历史、校验和备份恢复真实数据。
5. 完成空白创建/打开→继续写作→规划→T0→T1→候选审阅→采用→定稿→状态提取→作者裁决→校验→导出→恢复完整Electron E2E。
6. 单独验证T1三种唯一输入路径：Skeleton Candidate、权威SceneBeat和直接章节目标；零来源、多来源与字段错配必须拒绝。
7. 验证T0可完全绕过：无Skeleton、无SceneBeat时以直接章节目标生成Prose Candidate。
8. 验证Skeleton结构化Payload持久化、作者编辑、Hash校验、T1按ID读取和禁止正文Preview/Diff/Apply。
9. 验证partial保存、继续生成、手动补全、整稿采用拒绝和直接定稿拒绝。
10. 验证GenerationRun在切章、切页、取消、断流和应用重启后的真实状态，不宣称内存流已恢复。
11. 验证Final Version→`state_extract`→StateProposalBatch→pending StateProposal→作者接受/编辑接受/拒绝→权威状态与快照完整闭环。
12. pending提案不得参与M6-02权威语义校验，作者确认后状态必须正确参与。
13. 按Provider、Model、Task、PromptVersion记录T0、T1、rewrite、merge、validate、state_extract和连续性Eval。
14. Prompt、Eval和ModelSupportProfile版本必须一致；不一致时支持等级降级或阻断。
15. 验证M6-04人工写作统计：AI采用、TXT/Markdown/DOCX导入、批量替换、恢复、结构操作和系统维护均不得计入人工净增或有效写作速度。
16. 验证日常滚动、普通重大恢复点配额、关键Migration点、作者保留快照和最后已验证备份保护。
17. 完成1280×800、2K、21:9、混合DPI、两套主题、减少动态、键盘和读屏矩阵。
18. 所有性能与体验结果记录真实数据、设备环境、Fixture规模和统计方法，禁止伪造倒计时或进度。
19. 发现局部缺陷可在明确路径中修复并补回归；跨模块设计缺陷建立独立任务，不在验收卡内扩张。

## 测试与证据

- 性能、E2E、Eval、显示、无障碍和统计口径矩阵全部运行。
- T1三种输入路径、非法组合、Skeleton结构化往返和Apply拒绝。
- 取消后无迟到delta、断流和重启真实状态。
- partial限制与继续生成。
- T0→T1→Candidate→采用→定稿全链路。
- 定稿→state_extract→StateProposalBatch→StateProposal→作者确认→快照全链路。
- pending隔离和确认后状态参与校验。
- 人工写作统计排除全部非人工来源，包括M6-05与M6-06后续入口。
- Prompt/Eval/ModelSupportProfile版本一致性报告。
- 三轨备份配额与保护规则回归。
- 达拆分或架构阈值时单独提出后续任务，不顺手大改。
- 未达标功能有明确降级或阻断结论。

证据保存到：`docs/test-evidence/M8-02/`

## 完成条件

- 形成可复核性能报告、E2E报告、AI支持档案、显示证据和写作统计口径报告。
- Skeleton、partial、取消、重启和state_extract关键路径全部有真实Electron证据。
- T1三种来源均可用且每个Run恰好一种来源。
- Prompt、Eval和ModelSupportProfile版本一致。
- 人工写作指标未混入AI或系统变更。
- 三轨备份配额、保护和恢复语义与M6-06一致。
- 不存在伪造进度、伪恢复或只跑局部成功路径。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、性能、UI或测试文档。
