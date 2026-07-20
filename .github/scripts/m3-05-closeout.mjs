import { readFileSync, writeFileSync } from 'node:fs';

function replace(path, oldValue, newValue, expectedCount = 1) {
  const content = readFileSync(path, 'utf8');
  const actualCount = content.split(oldValue).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(
      `${path}: expected ${expectedCount} occurrence(s), found ${actualCount}: ${JSON.stringify(oldValue)}`,
    );
  }
  writeFileSync(path, content.replace(oldValue, newValue), 'utf8');
}

const taskCard = readFileSync('docs/tasks/M3/M3-05_FORESHADOWING_CHARACTER_ARC.md', 'utf8');
if (taskCard.includes('## 质量加固与实现记录')) {
  process.stdout.write('M3-05 closeout documentation is already synchronized.\n');
  process.exit(0);
}

replace(
  'docs/database/DATABASE_SCHEMA.md',
  `#### \`foreshadowings\`（M3-05）

\`id TEXT PK, project_id TEXT FK, title TEXT, content TEXT, status TEXT, planted_chapter_id TEXT NULL, recycle_start_chapter_id TEXT NULL, recycle_end_chapter_id TEXT NULL, revealed_chapter_id TEXT NULL, is_overdue INTEGER\`

状态：planned/planted/reinforced/partially_revealed/revealed/cancelled。

#### \`foreshadowing_relations\`（M3-05）

\`from_id TEXT FK, to_id TEXT FK, relation_type TEXT\`

类型：depends_on/blocked_by/mutually_exclusive/enhances。

#### \`ending_snapshots\`（M3-06）

\`id TEXT PK, chapter_id TEXT UNIQUE FK, source_version_id TEXT FK, snapshot_json TEXT, content_hash TEXT, stale INTEGER, created_at TEXT\`

#### \`character_arcs\`（M3-05）

\`id TEXT PK, entity_id TEXT FK, title TEXT, arc_type TEXT, status TEXT, description TEXT, created_at TEXT, updated_at TEXT\`

状态：planning/developing/resolved。

#### \`arc_milestones\`（M3-05）

\`id TEXT PK, arc_id TEXT FK, chapter_id TEXT NULL, order_key INTEGER, milestone_type TEXT, description TEXT, status TEXT, depends_on_json TEXT, resolved_at TEXT NULL\`

状态：planned/hit/skipped。状态变化必须经作者命令或后续StateProposal确认。`,
  `#### \`foreshadowings\`

由\`0014_foreshadowing_character_arc.sql\`建立：

\`id TEXT PK, project_id TEXT FK, title TEXT, description TEXT, status TEXT, reveal_from_chapter_id TEXT FK NULL, reveal_by_chapter_id TEXT FK NULL, created_at TEXT, updated_at TEXT\`

约束与语义：

- 状态为\`planned/planted/reinforced/partially_revealed/revealed/cancelled\`。
- 回收窗口按项目内章节顺序校验；起点不得晚于终点。
- \`(id, project_id)\`唯一，关系表通过复合外键阻断跨项目引用。
- Core拒绝非法状态流转、依赖循环、自依赖和已激活互斥冲突。

#### \`foreshadowing_chapters\`

\`project_id TEXT FK, foreshadowing_id TEXT, chapter_id TEXT FK, role TEXT, created_at TEXT\`

\`WITHOUT ROWID, STRICT\`。主键为\`(foreshadowing_id, chapter_id, role)\`；角色为\`plant/reinforce/partial_reveal/reveal/reference\`。

#### \`foreshadowing_relations\`

\`project_id TEXT FK, source_foreshadowing_id TEXT, target_foreshadowing_id TEXT, relation_kind TEXT, created_at TEXT\`

\`WITHOUT ROWID, STRICT\`。主键为\`(source_foreshadowing_id, target_foreshadowing_id, relation_kind)\`；类型为\`depends_on/blocks/mutually_exclusive/reinforces\`。数据库拒绝自关联，Core额外校验依赖环与互斥激活冲突。

#### \`ending_snapshots\`（M3-06规划）

\`id TEXT PK, chapter_id TEXT UNIQUE FK, source_version_id TEXT FK, snapshot_json TEXT, content_hash TEXT, stale INTEGER, created_at TEXT\`

#### \`character_arcs\`

\`id TEXT PK, project_id TEXT FK, character_id TEXT, title TEXT, arc_type TEXT, custom_type TEXT NULL, status TEXT, author_intent TEXT, created_at TEXT, updated_at TEXT\`

类型为\`growth/darkening/awakening/fall/redemption/custom\`；状态为\`planned/active/completed/abandoned\`。自定义类型仅允许在\`arc_type='custom'\`时填写；Character通过复合外键绑定同项目活动人物。

#### \`arc_milestones\`

\`id TEXT PK, project_id TEXT FK, arc_id TEXT, title TEXT, description TEXT, sort_index INTEGER, planned_chapter_id TEXT FK NULL, actual_chapter_id TEXT FK NULL, status TEXT, confirmation_source TEXT NULL, created_at TEXT, updated_at TEXT\`

状态为\`planned/hit/skipped\`，确认来源为\`author/state_proposal\`。planned必须没有实际章节和确认来源；hit/skipped必须具有确认来源。同一Arc内\`sort_index\`唯一，列表按\`sort_index, id\`确定性排序。

#### \`arc_milestone_dependencies\`

\`project_id TEXT FK, milestone_id TEXT, dependency_milestone_id TEXT, created_at TEXT\`

主键为\`(milestone_id, dependency_milestone_id)\`；两端绑定同项目节点并拒绝自依赖。Core拒绝依赖循环，命中节点前要求前置节点已hit。

#### \`arc_milestone_timeline_dependencies\`

\`project_id TEXT FK, milestone_id TEXT, timeline_event_id TEXT, created_at TEXT\`

主键为\`(milestone_id, timeline_event_id)\`；节点与TimelineEvent均通过复合外键绑定同项目。`,
);

replace(
  'docs/database/DATA_DICTIONARY.md',
  `StateProposal类型：

\`\`\`text
entity_state | arc_milestone
\`\`\`

StateProposal状态：

\`\`\`text
pending | accepted | edited | rejected
\`\`\`

ArcMilestone状态：

\`\`\`text
planned | hit | skipped
\`\`\`

\`pending\`弧光提案不能提前改变ArcMilestone状态。

Foreshadowing状态：

\`\`\`text
planned | planted | reinforced | partially_revealed | revealed | cancelled
\`\`\``,
  `StateProposal类型：

\`\`\`text
entity_state | arc_milestone
\`\`\`

StateProposal状态：

\`\`\`text
pending | accepted | edited | rejected
\`\`\`

Foreshadowing状态：

\`\`\`text
planned | planted | reinforced | partially_revealed | revealed | cancelled
\`\`\`

Foreshadowing章节角色：

\`\`\`text
plant | reinforce | partial_reveal | reveal | reference
\`\`\`

Foreshadowing关系：

\`\`\`text
depends_on | blocks | mutually_exclusive | reinforces
\`\`\`

回收窗口按章节顺序使用包含起点和终点的提示语义；超过终点且未解决时标记overdue。\`depends_on\`和\`blocks\`目标未进入revealed/cancelled时显示blocked；\`reinforces\`只提供软关联。Core拒绝依赖循环、自依赖以及两个已激活伏笔之间新增或触发的互斥冲突。

CharacterArc类型：

\`\`\`text
growth | darkening | awakening | fall | redemption | custom
\`\`\`

CharacterArc状态：

\`\`\`text
planned | active | completed | abandoned
\`\`\`

ArcMilestone状态：

\`\`\`text
planned | hit | skipped
\`\`\`

ArcMilestone确认来源：

\`\`\`text
author | state_proposal
\`\`\`

节点可依赖同项目ArcMilestone或TimelineEvent；节点依赖必须先hit，里程碑按\`sortIndex, id\`确定性排序。M3-05公开写入口只接受author权限；AI不能创建、修改或推进伏笔、人物弧光和弧光节点权威状态。\`pending\`弧光提案不能提前改变ArcMilestone状态。`,
);

replace(
  'docs/contracts/IPC_CONTRACTS.md',
  `window.worldforgeContinuity = {
  list: {},
  setEntityState: {},
  invalidateEntityState: {},
  saveTimelineEvent: {},
  archiveTimelineEvent: {},
  setKnowledgeState: {},
  invalidateKnowledgeState: {},
};`,
  `window.worldforgeContinuity = {
  list: {},
  setEntityState: {},
  invalidateEntityState: {},
  saveTimelineEvent: {},
  archiveTimelineEvent: {},
  setKnowledgeState: {},
  invalidateKnowledgeState: {},
};

window.worldforgeNarrativePlanning = {
  list: {},
  saveForeshadowing: {},
  transitionForeshadowing: {},
  saveCharacterArc: {},
  saveArcMilestone: {},
  transitionArcMilestone: {},
};`,
);
replace(
  'docs/contracts/IPC_CONTRACTS.md',
  'M3-04使用独立窄桥`window.worldforgeContinuity`接通连续性账本，避免扩写旧Preload主入口；M3-07—M3-10 Renderer架构迁移时再统一适配到正式Bridge边界。禁止暴露通用`send(channel,payload)`、Node模块、文件系统、数据库连接、环境变量和任意URL请求。',
  'M3-04使用独立窄桥`window.worldforgeContinuity`接通连续性账本；M3-05使用`window.worldforgeNarrativePlanning`接通伏笔与人物弧光账本。两者均只暴露具名方法，M3-07—M3-10 Renderer架构迁移时再统一适配到正式Bridge边界。禁止暴露通用`send(channel,payload)`、Node模块、文件系统、数据库连接、环境变量和任意URL请求。',
);
replace(
  'docs/contracts/IPC_CONTRACTS.md',
  `后续规划命令仍包括：

- \`continuity.stateProposal.list/accept/editAndAccept/reject\`
- \`continuity.foreshadowing.create/update/archive/list\`
- \`continuity.snapshot.get/markStale/rebuild\`

### 4.6 人物弧光

- \`arc.create/update/archive/list/get\`
- \`arc.createMilestone/updateMilestone/moveMilestone/archiveMilestone\`
- \`arc.listMilestones\`

AI不能调用直接推进里程碑状态的命令。里程碑状态只能通过\`continuity.stateProposal.accept/editAndAccept\`更新。`,
  `M3-05冻结的叙事规划命令：

| 命令 | IPC频道 | 输入 | 输出 |
|---|---|---|---|
| \`narrativePlanning.list\` | \`worldforge:narrative-planning:list\` | projectId、query、includeResolved、referenceChapterId | 伏笔与人物弧光目录 |
| \`narrativePlanning.saveForeshadowing\` | \`worldforge:narrative-planning:save-foreshadowing\` | author权限、foreshadowingId可空、标题、描述、回收窗口、章节角色、关系 | 最新目录 |
| \`narrativePlanning.transitionForeshadowing\` | \`worldforge:narrative-planning:transition-foreshadowing\` | author权限、foreshadowingId、目标状态 | 最新目录 |
| \`narrativePlanning.saveCharacterArc\` | \`worldforge:narrative-planning:save-character-arc\` | author权限、arcId可空、characterId、类型、自定义类型、状态、作者意图 | 最新目录 |
| \`narrativePlanning.saveArcMilestone\` | \`worldforge:narrative-planning:save-arc-milestone\` | author权限、milestoneId可空、arcId、排序、计划章节、节点/时间线依赖 | 最新目录 |
| \`narrativePlanning.transitionArcMilestone\` | \`worldforge:narrative-planning:transition-arc-milestone\` | author权限、milestoneId、planned/hit/skipped、实际章节 | 最新目录 |

Main先校验可信Renderer URL和strict命令Schema，再转换为\`CoreNarrativePlanningOperationSchema\`；Core返回值同时通过Core与IPC结果Schema校验。所有写命令只接受\`authority='author'\`，项目、章节、人物、伏笔、节点和TimelineEvent引用都在进入单写事务前校验。Core负责状态机、回收窗口、依赖环、互斥冲突和节点命中前置条件。

M3-06后续命令包括：

- \`continuity.stateProposal.list/accept/editAndAccept/reject\`
- \`continuity.snapshot.get/markStale/rebuild\`

### 4.6 人物弧光

M3-05已实现CharacterArc创建/更新、ArcMilestone创建/更新/移动计划章节和作者显式状态转换。\`confirmationSource='state_proposal'\`为M3-06保留统一入口；M3-05没有AI直写权威状态的IPC命令。`,
);
replace(
  'docs/contracts/IPC_CONTRACTS.md',
  '- M3-04由`tests/security/continuity-ipc.test.ts`和真实Electron `tests/e2e/continuity-ledger.spec.ts`验证完整调用链。',
  '- M3-04由`tests/security/continuity-ipc.test.ts`和真实Electron `tests/e2e/continuity-ledger.spec.ts`验证完整调用链。\n- M3-05由`tests/security/narrative-planning-ipc.test.ts`、`tests/security/candidate-preview-ipc.test.ts`和真实Electron `tests/e2e/narrative-planning-ledger.spec.ts`验证六个具名命令、可信来源边界及桌面写入展示链路。',
);

replace(
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
  '| REQ-021 | 伏笔生命周期                       | FSH-001                  | DATABASE_SCHEMA                            | M3-05                      | P0-040                 | In Progress |',
  '| REQ-021 | 伏笔生命周期                       | FSH-001                  | DATABASE_SCHEMA                            | M3-05                      | P0-040                 | Implemented |',
);
replace(
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
  '| REQ-022 | 状态提案与尾快照                   | STA-002、SNP-001         | ADR-004、DATABASE_SCHEMA                   | M3-06                      | P0-041、P0-042         | Planned     |',
  '| REQ-022 | 状态提案与尾快照                   | STA-002、SNP-001         | ADR-004、DATABASE_SCHEMA                   | M3-06                      | P0-041、P0-042         | In Progress |',
);
replace(
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
  '| REQ-045 | 人物弧光建模、确认与一致性校验     | ARC-001—004              | FUNCTION_CATALOG、ADR-006                  | M3-05、M3-06、M6-02        | P0-071、P0-072         | Planned     |',
  '| REQ-045 | 人物弧光建模、确认与一致性校验     | ARC-001—004              | FUNCTION_CATALOG、ADR-006                  | M3-05、M3-06、M6-02        | P0-071、P0-072         | In Progress |',
);
replace(
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
  '## M3-04验收闭环',
  `## M3-05实现闭环

- 实现与加固基线：\`d0903e133a7d10165016aa0f587bff9908680dd1\`。
- 修复真实格式门禁被错误脚本替换、已激活伏笔后补互斥关系未拒绝、Candidate IPC重复注册Continuity导致Electron启动失败三类问题。
- 补齐回收窗口、自依赖/依赖环、互斥、增强软关系、章节移动、TimelineEvent依赖、planned/hit/skipped和AI零权威写入回归。
- PR #96在实现基线上通过Quality运行\`29732645227\`、Security运行\`29732645161\`和Performance运行\`29732645079\`；Migration、Integration、Build、Package Smoke、clean-tree与真实Electron E2E均成功。
- M3-05转为\`Implemented\`并进入延期最终验收；REQ-021同步为\`Implemented\`。M3-06激活后，REQ-022与REQ-045保持\`In Progress\`。

## M3-04验收闭环`,
);

replace(
  'docs/tasks/M3/M3-05_FORESHADOWING_CHARACTER_ARC.md',
  '任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。',
  `## 质量加固与实现记录

- 恢复真实Prettier格式门禁，删除会打包源码并强制失败的错误脚本行为。
- Core新增“已激活伏笔之间后补互斥关系”拒绝，覆盖保存时和状态流转时的双路径冲突。
- 拆除Candidate Preview内部重复注册Continuity IPC的职责耦合，修复Electron在\`ipc-register\`阶段启动失败，并增加仅注册Candidate频道的回归测试。
- 补齐反向回收窗口、自关联、依赖环、互斥、\`reinforces\`、AI写入拒绝、节点章节移动、TimelineEvent跨项目、\`skipped\`与确认来源测试。
- 实现基线：\`d0903e133a7d10165016aa0f587bff9908680dd1\`。Quality运行\`29732645227\`、Security运行\`29732645161\`、Performance运行\`29732645079\`全部成功；真实Electron E2E、Migration、Integration、Build、Package Smoke与clean-tree均通过。
- 按implementation-pr协议，本任务记录为\`Implemented\`并加入延期最终验收；标准证据包、人工验收矩阵与\`Verified\`关闭留待批量复验。

任务关闭前必须同步\`TASK_INDEX.md\`、\`V1.0_TRACEABILITY_MATRIX.md\`及实际受影响的Schema、IPC、UI、安全或测试文档。`,
);

replace(
  'docs/tasks/M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md',
  '> 建议分支：`feat/m3-state-proposal-snapshot`',
  '> 建议分支：`work/m3-06-state-proposal-snapshot`',
);
