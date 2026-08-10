# M11-02 统一 AI 审阅底座

> 状态：In Progress
> 里程碑：M11 产品体验与 AI 创作协同
> 优先级：P0
> 执行分支：`work`
> 目标分支：`main`
> 主线基线：`7ce8247752c69de7c34f27b20e61a2d87e7e4274`

## 目标

在保留现有 `StateProposal` 持久化、来源新鲜度和作者裁决安全边界的前提下，建立统一的“AI审阅”读模型、工作台和动作语义，使当前人物/世界状态与成长节点建议先进入同一个作者审阅入口，并为 M11-03 后续人物知情、新设定、时间线、关系、伏笔等提取类型预留稳定扩展面。

## 阶段定位

M11-01 已完成中文作者语境和高频交互减负。本任务承接现有 `state_extract → StateProposal → 作者接受/修改/忽略` 链，将用户层从“AI设定建议专页”提升为统一“AI审阅”，但暂不扩大权威数据写入类型。

## 非目标

- 不新增数据库表，不修改现有 Migration。
- 不在本任务新增人物关系持久化。
- 不在本任务新增人物知情、时间线、伏笔、世界规则或新实体的 AI 写入。
- 不实现定稿后自动触发分析；本任务先保留作者主动“分析定稿”。
- 不引入冲突检查引擎和合理例外；由 M11-06/M11-07 承接。
- 不做关系图、时间轴、伏笔泳道等可视化；由后续可视化任务承接。

## 依赖

- M11-01：有效 Verified。
- 复用 M3-06 StateProposal、EndingSnapshot、来源失效与作者裁决机制。
- 复用 M4-04 `state_extract` GenerationRun 与 Provider 分析链。

## 真实承接基线

- `main` / `work`：`7ce8247752c69de7c34f27b20e61a2d87e7e4274`
- 当前仓库长期分支仅 `main`、`work`。
- 被替代工具链 Draft #348 已关闭归档。

## 关联

- 产品总纲：`docs/product/V1.1_AUTHOR_AI_EXPERIENCE_IMPLEMENTATION_PLAN.md`
- 作者语言：`docs/product/AUTHOR_LANGUAGE_GLOSSARY.md`
- 当前持久化合同：`packages/contracts/src/state-proposal.ts`
- 当前审阅界面：`apps/desktop/renderer/src/features/canon/state-proposal-panel.tsx`

## 主要影响范围

- `packages/contracts/src/`：新增非持久化的统一 AI 审阅读模型合同，不破坏现有 StateProposal wire contract。
- `apps/desktop/renderer/src/features/canon/`：统一 AI 审阅模型适配、过滤、汇总和作者裁决界面。
- `apps/desktop/renderer/src/presentation/`：正式作者术语加入“AI审阅 / AI审阅建议”。
- `tests/`：合同、适配、Renderer 与现有 E2E 回归。
- 当前产品/任务文档。

## 职责、状态所有权与依赖方向

1. `StateProposal` 继续拥有数据库持久化、批次、来源定稿、失效和 resolve 写入语义。
2. `ReviewProposal` 是统一作者审阅读模型，不直接写数据库。
3. StateProposal → ReviewProposal 只允许单向适配；Renderer 不反向构造 StateProposal 写入。
4. 作者决策仍通过现有 `stateProposal.resolve`，避免出现第二套权威写入接口。
5. 后续 M11-03 新提取类型必须扩展 ReviewProposal，而不能再新增平行审阅页面。

## 数据库与 Migration

无数据库迁移。现有 `state_proposals` / `state_proposal_batches` / `ending_snapshots` 保持不变。

## IPC、事件与错误码

本任务不新增 IPC channel 和错误码。继续复用：

- `stateProposal.list`
- `stateProposal.resolve`
- `stateProposal.readSnapshot`
- `generation.start` + `state_extract`

## UI 闭环

统一“AI审阅”入口至少提供：

- 当前待确认数量、已处理数量、来源已变化数量。
- 按章节筛选。
- 按处理状态筛选：待确认 / 已处理 / 全部。
- 按建议类型筛选。
- 每条建议显示当前记录、AI建议、可信度、内容依据和来源状态。
- 接受、修改后接受、忽略继续复用现有作者裁决。
- 来源定稿已变化的旧建议只能忽略。
- 无建议、加载、运行中、失败、只读状态均有明确反馈。
- 技术 ID / 原始 JSON 继续只放折叠技术详情。

## 安全、隐私与恢复

- AI分析仍使用作者显式选择的 AI连接。
- 不新增上传范围；沿用现有 `state_extract` 上下文组装。
- AI结果不得自动写入权威数据。
- 旧来源建议不得重新接受。
- 所有正式写入继续走现有作者 authority 和 StateProposal resolve 事务。

## 性能预算

- 过滤与汇总均在已加载 catalog 上本地计算，不增加 Core 请求次数。
- 不为每个建议单独请求章节/实体数据。
- 现有 1 秒 GenerationRun 单飞轮询保持不变。

## 实施内容

### A. ReviewProposal 统一读模型

- 建立通用审阅类别、状态、来源、可信度和目标描述。
- 当前 `entity_state` 与 `arc_milestone` 映射为第一批审阅类型。
- 保留 StateProposal ID、batch、sourceVersion、generationRun 与 evidence 以支持作者决策和溯源。

### B. StateProposal 兼容适配

- 单一适配器将 StateProposalCatalog 转为 AIReviewCatalog。
- 未来新类型只扩适配层与读模型，不再复制页面状态机。

### C. AI审阅工作台

- 用户入口和标题统一为“AI审阅”。
- 增加待确认 / 已处理 / 来源变化汇总。
- 增加状态与类型过滤。
- 保持章节与 AI连接选择、主动分析定稿、运行进度、EndingSnapshot 概览。

### D. 作者裁决

- 接受 / 修改后接受 / 忽略继续映射到旧 proposal ID。
- 不改变 stale → reject_only 规则。
- 修改后接受继续使用 M11-01 的作者值编辑器。

### E. 回归保护

至少覆盖：

- StateProposal → ReviewProposal 映射完整。
- 待确认、已处理、来源变化统计准确。
- 过滤不会改变底层 catalog。
- stale 建议仍只能忽略。
- 当前 E2E StateProposal 工作流继续通过。
- 用户可见入口统一为“AI审阅”，内部 data attribute 和 wire contract 可保持兼容。

## 自动化测试

```text
pnpm task:validate
pnpm check:language
pnpm check:workspaces
pnpm check:boundaries
pnpm format:check
pnpm lint
pnpm ci:policy
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm build
pnpm test:e2e
```

## 人工验收

1. 打开“人物与世界 → AI审阅”。
2. 选择一个已定稿章节和 AI连接，执行“分析定稿”。
3. 分析结束后建议进入统一审阅列表。
4. 切换待确认/已处理/全部与类型筛选，数量和列表一致。
5. 接受、修改后接受、忽略分别验证。
6. 修改来源定稿后旧建议明确显示“来源已经变化”，且接受动作不可用。
7. 只读作品不允许执行分析和作者裁决。

## Evidence

保存到：`docs/test-evidence/M11-02/`

## 回滚策略

本任务无数据库迁移。若出现问题，可回退 ReviewProposal 读模型、适配器和 AI审阅 UI，现有 StateProposal 数据与写入链不需要回滚。

## 完成条件

- [ ] 建立统一 ReviewProposal / AIReviewCatalog 读模型。
- [ ] 当前 StateProposal 可完整适配到统一审阅模型。
- [ ] 用户入口统一为“AI审阅”。
- [ ] 待确认/已处理/来源变化汇总和筛选可用。
- [ ] 作者裁决、来源失效、只读保护保持不变。
- [ ] 无数据库迁移和第二套权威写入路径。
- [ ] 单元、集成、Coverage、E2E 全部通过。
- [ ] Schema 2 Evidence 收口并绑定来源 PR。
- [ ] 合并后 `main-verification` 与 `task-verification/M11-02` 成功。
