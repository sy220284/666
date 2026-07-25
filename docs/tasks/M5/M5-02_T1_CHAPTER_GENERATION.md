# M5-02 T1章节扩写

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`work/m5-02-t1-chapter-generation`

## 目标

基于作者选定或编辑后的Skeleton、权威SceneBeat或直接章节目标，使用完整约束包生成Prose Candidate。

## 阶段定位

完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。T0保持可选，M5-02只负责章节生成业务编排。

## 非目标

- 不直接写Draft。
- 不要求所有模型输出长正文JSON。
- 不伪造SceneBeat满足Prompt Schema。
- 不重复实现GenerationRun、取消、流式、partial持久化或重启恢复。
- 不允许Renderer通过字段优先级决定T1权威输入来源。

## 依赖

M5-01

## 关联

- 需求：REQ-026
- 功能ID：AI-005
- 验收：P0-026

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md`
- `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md`
- `docs/tasks/M5/M5-01_T0_SKELETON.md`

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

## 合法输入路径

```text
T1输入来源（每次请求恰好一种）
├─ sourceType: skeleton_candidate
│  └─ selectedSkeletonCandidateId
├─ sourceType: canonical_scene_beats
│  └─ sceneBeatIds[]
└─ sourceType: direct_chapter_goal
   └─ chapterGoal
```

规则：每次请求必须且只能选择一种来源；零来源、多来源、`sourceType`与字段不匹配均拒绝。存在Skeleton时按ID读取已持久化结构化Payload；无Skeleton时可使用权威SceneBeat；二者均无时允许直接章节目标生成。

## 实施内容

1. 接入M4-04定义的T1判别联合输入合同，明确记录实际使用的唯一输入路径。
2. Skeleton路径必须读取同项目、同章节、可用状态且结构化Hash有效的Skeleton Candidate；来源已过期时必须由Core复核并要求作者确认或重新生成，禁止Renderer提交未持久化骨架替代权威数据。
3. SceneBeat路径只接受ID，由Core读取当前权威SceneBeat并验证项目、章节、状态和顺序；无SceneBeat时不得创建虚假节拍。
4. 直接目标路径将章节目标、目标字数、文风、必须/禁止项和约束包进入Prompt及GenerationRun追溯。
5. 三条路径必须使用同一ConstraintPackage、Prompt Registry、GenerationRun和Prose Candidate收口，不建立路径专属状态机。
6. 优先使用纯文本流；仅在ModelSupportProfile验证通过时使用temporaryId/beatId/type/content结构化Blocks。
7. Renderer只展示M4-05流事件和临时增量；完成后解析并通过正式入口一次保存完整Prose Candidate。
8. 取消、断流、切章、多任务和重启后的Run状态全部复用M4-05；本任务只提供“保存partial/丢弃”的产品入口。
9. partial Candidate必须明确标识，禁止直接定稿或默认整稿采用。
10. 禁止模型外壳、直接Patch和未确认Draft写入。
11. 后置校验报告必选事件、前章衔接、设定状态、篇幅和约束风险；校验结果不直接修改Candidate或Draft。

## 测试与证据

- Skeleton、SceneBeat、直接章节目标三条路径及非法零来源、多来源、字段错配输入。
- T0完全绕过、无SceneBeat直接生成、跨项目Skeleton、损坏Skeleton和过期来源复核。
- SceneBeat只按ID读取，Renderer伪造节拍全文和跨章节ID被拒绝。
- 纯文本和结构化双模式、断流、取消、格式修复失败和骨架遗漏。
- 切章续跑、多任务并行和重启后Run状态。
- partial限制、后置校验和唯一来源追溯。
- 任何失败不改变Draft。

证据保存到：`docs/test-evidence/M5-02/`

## 完成条件

- T1输出始终进入Prose Candidate。
- 作者可跳过T0并以权威SceneBeat或章节目标直接生成。
- 每个Run恰好记录一种T1输入来源，不存在零来源、多来源或Renderer优先级选择。
- 不存在为了满足Schema而伪造SceneBeat的路径。
- 运行、取消、流式和partial持久化没有复制M4-05实现。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、UI、安全或测试文档。
