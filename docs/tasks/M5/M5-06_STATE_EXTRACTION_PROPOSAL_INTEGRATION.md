# M5-06 真实状态提取与StateProposal接入

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`work/m5-06-state-extraction-proposal`

## 目标

将章节当前Final Version通过真实Provider执行`state_extract`，生成严格、可追溯、只读待确认的StateProposal，并复用既有作者裁决、EntityState、ArcMilestone和EndingSnapshot闭环。

## 阶段定位

补齐M4 Prompt/GenerationRun与M3-06状态提案之间缺失的生产接线。AI只提出变化，作者继续拥有接受、编辑接受和拒绝权。

## 非目标

- 不允许AI直接写EntityState、ArcMilestone或EndingSnapshot。
- 不重写M3-06作者裁决、快照、失效和状态写入服务。
- 不将pending提案当作已确认状态。
- 不要求Provider可用才能完成定稿、写作或手工维护状态。

## 依赖

M5-05、M3-06

## 承接基线

- M3-06：StateProposal双类型、证据校验、作者裁决、有效期、EndingSnapshot和派生失效。
- M4-04：生产`state_extract` Prompt、严格输出Schema和Parser。
- M4-05：GenerationRun、Provider执行、取消、结果追溯和模型支持档案。
- M5-05：统一候选/待确认结果入口和作者语言层。

## 关联

- 需求：REQ-022、REQ-030、REQ-045
- 功能ID：STA-002、SNP-001、AI-010、ARC-003基础
- 验收：P0-041、P0-042、P0-071、P0-072相关AI闭环

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/decisions/ADR-006-character-arc-via-state-proposal.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/architecture/DATA_FLOW.md`
- `docs/tasks/M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md`
- `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md`

## 主要影响范围

- `packages/prompts/`
- `packages/contracts/`
- `packages/core-service/`
- `apps/desktop/main/`中的Generation/StateProposal接线
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`

默认不修改M3既有表语义；真实Provider来源或GenerationRun结果引用确需扩展时使用追加Migration并保持历史数据兼容。

## 权威链路

```text
当前Final Version
→ state_extract GenerationRun
→ 严格Schema解析与Core复核
→ pending StateProposal
→ 作者接受 / 编辑接受 / 拒绝
→ EntityState / ArcMilestone
→ EndingSnapshot与派生失效
```

## 实施内容

1. 只有章节当前Final Version可启动`state_extract`；Draft、Candidate、旧Version和跨项目Version必须拒绝。
2. 从Final Version读取正文块、实体/弧光目录和约束包，通过M4-05执行真实Provider任务。
3. Provider输出转换为当前StateProposalDraft合同：`entity_state | arc_milestone`、目标、建议值、数值型`confidence`、`EvidenceAnchor[]`、`validUntilChapterId`和`actualChapterId`。
4. `previousValue`、实体当前状态和弧光节点当前状态必须由Core读取权威数据计算，禁止采用模型提供的旧值。
5. Core重新验证项目、章节、实体、弧光节点、章节有效区间和证据归属；每条提案至少包含一个属于Final Version的正文块证据。
6. 无效目标、跨项目引用、无证据、重复目标或非法有效期整批拒绝，不留下部分pending数据。
7. GenerationRun成功与StateProposal批次创建建立完整结果引用；失败、取消或解析错误不得伪造成功。
8. 所有真实AI结果只写`pending` StateProposal，复用M3-06的接受、编辑接受、拒绝、状态更新、快照和失效流程。
9. 作者可查看本次发送的数据类别、模型、Prompt版本、约束来源、证据和置信度；普通界面不得暴露无必要工程术语。
10. Provider不可用、模型未验证或Eval不达标时允许使用规则、手工或明确风险的降级路径，不影响定稿与离线写作。
11. pending提案不得进入M6语义校验的权威上下文；只有作者确认后的状态可参与后续判断。
12. 普通日志不得记录正文、完整Prompt、约束全文或模型原始响应。

## 测试与证据

- 当前Final Version、旧Version、Draft、Candidate和跨项目输入边界。
- entity_state与arc_milestone双类型、`validUntilChapterId`、`actualChapterId`和数值置信度。
- Final Version正文块证据、无证据、错误证据、重复目标和批次原子回滚。
- Provider正常、取消、断流、超时、无效输出、未验证模型和AI不可用降级。
- GenerationRun与StateProposal结果引用完整。
- pending不改变权威状态；接受、编辑接受和拒绝继续复用M3-06。
- 定稿→提取→提案→作者确认→快照完整Electron E2E。
- 日志与错误响应敏感内容扫描。

证据保存到：`docs/test-evidence/M5-06/`

## 完成条件

- 真实Provider状态提取链路可用且结果只进入pending StateProposal。
- AI直接写EntityState、ArcMilestone或EndingSnapshot的成功次数为0。
- 每条提案可追溯到Final Version证据、GenerationRun、Prompt和约束来源。
- pending提案不被任何后续功能当作权威事实。
- Provider不可用时作者仍可定稿、写作和手工维护状态。
- M6-02可安全依赖已确认状态执行语义与人物弧光校验。

任务关闭前必须同步`TASK_INDEX.md`、`M5_TASKS.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、数据流、安全或测试文档。
