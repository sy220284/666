# M6-04 网文节奏与连载指标

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`work/m6-04-genre-rhythm-serial-metrics`

## 目标

提供作者可编辑、建议级的爽点密度、章末钩子、更新节奏、人工写作统计和黄金三章分析。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。写作统计必须区分人工输入与AI采用、导入、恢复和结构操作。

本任务建立统一`mutationOrigin`合同、改造当前已经存在的正文写入入口并形成统计真源；后续M6-05、M6-06分别负责把DOCX导入和恢复/项目复制接入同一合同，M8-02执行全来源最终回归。

## 非目标

- 不使用硬编码魔法数字。
- 不阻断写作、定稿或发布。
- 不替作者判断作品质量。
- 不把Candidate采用、导入、恢复、批量替换或结构调整计入作者码字速度。
- 不将统计数据变成正文或历史记录的权威真源。
- 不在本任务提前实现M6-05 DOCX或M6-06三轨恢复业务。

## 依赖

M3-02、M6-01、M6-02、M6-03

## 承接基线

- 复用SceneBeat、Draft Patch、Version、Candidate Apply、现有TXT/Markdown导入、恢复和结构操作的事务入口。
- 现有`draft_patch_log`缺少可靠操作来源，本任务必须先建立统一来源标记或独立写作会话统计，禁止直接将全部Patch视为人工写作。
- 统计数据属于可重建派生数据。

## 关联

- 需求：REQ-046
- 功能ID：RHY-001—RHY-004
- 验收：P0-073、P0-074

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/testing/TEST_STRATEGY.md`
- `docs/tasks/M1/M1-06_AUTOSAVE_STATS_FIND.md`
- `docs/tasks/M5/M5-05_CANDIDATE_REVIEW_APPLY.md`
- `docs/tasks/M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md`

## 主要影响范围

- `migrations/project/`或`migrations/app/`（按统计归属确定）
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/unit/`
- `tests/integration/`
- `tests/migration/`
- `tests/security/`
- `tests/e2e/`

## 变更来源合同

```text
mutationOrigin
├─ manual_edit
├─ candidate_apply
├─ import
├─ safe_replace
├─ structure
├─ restore
└─ system
```

所有能够改变Draft的正式入口必须提供可验证来源；来源由Core命令或受控服务决定，Renderer不得任意指定。无法可靠补齐历史日志时，只从本任务上线后开始统计人工写作，不伪造历史数据。

## 分阶段所有权

```text
M6-04
├─ 建立mutationOrigin合同与Schema
├─ 改造当前已有manual_edit/candidate_apply/TXT-MD import/structure/restore入口
├─ 接入M6-03 safe_replace
└─ 建立写作会话与节奏统计

M6-05
└─ DOCX导入必须复用mutationOrigin: import

M6-06
└─ 三轨恢复、项目复制必须复用mutationOrigin: restore/system

M8-02
└─ 七类来源与全部后续入口最终回归
```

M6-04关闭时只对当时已存在的入口负责；M6-05、M6-06未实现功能不得提前宣称已验收。

## 实施内容

1. 实现GenreRhythmProfile，按频道保存可编辑参考区间，不在代码中散落阈值。
2. 爽点密度复用SceneBeat冲突、反转、信息释放节点，按千字统计。
3. 章末钩子使用规则+语义联合检测，输出建议级提示。
4. 为正文变更建立统一`mutationOrigin`，优先扩展标准Patch/Apply/Import/Structure/Restore调用边界；确有必要时建立独立本地写作会话表。
5. Core根据命令语义写入来源并拒绝Renderer伪造；所有来源映射必须有单元和安全测试。
6. 每日作者净增字数只统计`manual_edit`，排除Candidate采用、导入、批量替换、拆章/并章/跨章移动、Version恢复、Migration和系统维护。
7. 真实写作速度基于有效写作会话计算：开始编辑、最后有效输入、空闲阈值、有效活跃时长和人工净增字数。
8. 切章、关闭、崩溃恢复和跨午夜场景必须正确收口会话；空闲停留、滚动、查看设定和AI等待不计为有效写作时长。
9. 更新节奏展示当日人工净增、累计人工净增、有效写作时长和趋势，并明确统计口径与起始日期。
10. 黄金三章只对当前项目排序后的前3个有效章节生效，软删除、跨卷移动和重排后按权威结构重新计算。
11. 所有结果为P3建议级，可关闭、调整阈值和标记不适用。
12. 统计表、缓存和聚合可删除重建，不影响Draft、Version或ApplyRecord。
13. 为M6-05、M6-06提供明确接线测试合同和未完成项清单，禁止在M6-04证据中提前标绿。

## 测试与证据

- 不同频道、空SceneBeat、短章、长章和自定义阈值。
- manual_edit、candidate_apply、import、safe_replace、structure、restore、system七类来源合同与Renderer伪造拒绝。
- 当前已有AI采用、TXT/Markdown导入、恢复和拆并章不增加人工码字统计。
- 自动保存合并、撤销重做、切章、关闭、崩溃恢复、长时间空闲和跨午夜。
- 写作会话有效时长与人工净增字数口径。
- 黄金三章在软删除、跨卷移动、重排和新增前置章节后的范围重算。
- 派生统计删除重建不改变正文和历史记录。
- 建议不会进入阻断类ValidationIssue。
- AI不可用时规则部分仍可运行。
- 证据明确列出M6-05 DOCX与M6-06三轨恢复尚待后续任务接线的范围。

证据保存到：`docs/test-evidence/M6-04/`

## 完成条件

- 节奏指标透明可解释且不强迫作者。
- 当前已存在的正式正文入口全部具有可靠mutationOrigin，无法归类时拒绝计入人工统计。
- 人工写作统计不会混入AI、现有导入、替换、恢复、结构或系统操作。
- 无法可靠归类的历史数据不被伪装为精确作者产出。
- 统计数据可重建，不成为正文权威来源。
- M6-05和M6-06拥有明确接线合同，后续功能未被提前宣称通过。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、数据流、UI、安全或测试文档。
