import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const replacements = [
  {
    file: 'docs/database/DATABASE_SCHEMA.md',
    before: `由\`0016_state_proposal_snapshot.sql\`建立：

\`id TEXT PK, project_id TEXT FK, chapter_id TEXT FK, source_version_id TEXT FK, proposal_type TEXT, source TEXT, entity_id TEXT NULL, state_key TEXT NULL, arc_milestone_id TEXT NULL, previous_value_json TEXT NULL, proposed_value_json TEXT, evidence_json TEXT, confidence REAL, status TEXT, resolved_value_json TEXT NULL, created_at TEXT, resolved_at TEXT NULL\`

约束与语义：

- \`proposal_type\`为\`entity_state/arc_milestone\`；两类目标严格互斥。
- \`source\`为\`rule/provider_stub\`，\`confidence\`范围为0—1。
- \`proposed_value_json\`与可选\`resolved_value_json\`必须为合法JSON；Evidence必须为非空JSON数组。
- \`status\`为\`pending/accepted/edited/rejected\`；pending必须没有解决时间和最终值。
- 部分唯一索引分别保证同章节、同来源Version、同Entity状态键或同ArcMilestone最多一条pending提案。
- pending只写候选账本，不修改EntityState或ArcMilestone；作者批量裁决与权威状态更新在单事务完成。`,
    after: `由\`0016_state_proposal_snapshot.sql\`建立，\`0017_state_proposal_valid_until.sql\`追加有限期终点：

\`id TEXT PK, project_id TEXT FK, chapter_id TEXT FK, source_version_id TEXT FK, proposal_type TEXT, source TEXT, entity_id TEXT NULL, state_key TEXT NULL, arc_milestone_id TEXT NULL, previous_value_json TEXT NULL, proposed_value_json TEXT, evidence_json TEXT, confidence REAL, status TEXT, resolved_value_json TEXT NULL, valid_until_chapter_id TEXT FK NULL, created_at TEXT, resolved_at TEXT NULL\`

约束与语义：

- \`proposal_type\`为\`entity_state/arc_milestone\`；两类目标严格互斥，ArcMilestone提案不得设置\`valid_until_chapter_id\`。
- \`source\`为\`rule/provider_stub\`，\`confidence\`范围为0—1。
- \`proposed_value_json\`与可选\`resolved_value_json\`必须为合法JSON；Evidence必须为非空JSON数组。
- \`status\`为\`pending/accepted/edited/rejected\`；pending必须没有解决时间和最终值。
- EntityState提案的非空终点必须是同项目活动章节，并严格位于提案起始章节之后；区间采用\`[chapter_id, valid_until_chapter_id)\`半开语义。
- 部分唯一索引分别保证同章节、同来源Version、同Entity状态键或同ArcMilestone最多一条pending提案。
- pending只写候选账本，不修改EntityState或ArcMilestone；作者批量裁决与权威状态更新在单事务完成，\`accept/edit_accept\`均将终点写入\`entity_states.valid_until_chapter_id\`。`,
  },
  {
    file: 'docs/database/DATA_DICTIONARY.md',
    before:
      '`pending`只表示待作者裁决的候选，不改变EntityState或ArcMilestone。`accept`使用提议值，`edit_accept`使用作者编辑后的合法JSON值，`reject`不产生权威写入；一批裁决任一失败时整批回滚。接受`entity_state`会结束旧current并写入新current；接受`arc_milestone`会以`confirmationSource=state_proposal`推进节点，并在同一事务重建章节尾快照。',
    after:
      '`pending`只表示待作者裁决的候选，不改变EntityState或ArcMilestone。EntityState提案可携带`validUntilChapterId`；非空终点必须属于同项目、保持活动状态并严格位于提案章节之后，采用`[chapterId, validUntilChapterId)`半开语义。`accept`使用提议值，`edit_accept`使用作者编辑后的合法JSON值，两者都保留提案终点；`reject`不产生权威写入。一批裁决任一失败时整批回滚。接受`entity_state`会结束旧current并写入带相同终点的新current；接受`arc_milestone`会以`confirmationSource=state_proposal`推进节点，并在同一事务重建章节尾快照。',
  },
  {
    file: 'docs/contracts/IPC_CONTRACTS.md',
    before:
      '- M3-06由`tests/security/state-proposal-ipc.test.ts`、`tests/integration/state-proposal-snapshot.test.ts`和真实Electron `tests/e2e/state-proposal-workflow.spec.ts`验证六个具名命令、作者最终裁决、事务回滚、快照回退与桌面接受链路。',
    after:
      '- M3-06由`tests/security/state-proposal-ipc.test.ts`、`tests/integration/state-proposal-snapshot.test.ts`、`tests/integration/state-proposal-valid-until.test.ts`、`tests/integration/state-proposal-valid-until-boundaries.test.ts`和真实Electron `tests/e2e/state-proposal-workflow.spec.ts`、`tests/e2e/state-proposal-valid-until.spec.ts`验证六个具名命令、作者最终裁决、有限期半开区间、跨项目/逆序拒绝、批量回滚、快照回退与桌面接受链路。',
  },
  {
    file: 'docs/product/V1.0_TRACEABILITY_MATRIX.md',
    before: `## M3-06实现闭环

- 新增Schema 16、StateProposal、EndingSnapshot、DerivedInvalidation权威模型、六个具名IPC和作者裁决界面。
- pending提案零权威写入；接受、编辑接受、拒绝、EntityState或ArcMilestone更新及快照重建遵循单事务和作者最终裁决。
- 旧章纯文字修订不传播；位置、事件、时间线、伏笔和弧光语义变化只使后续派生快照stale，读取自动回退权威当前表。
- Static、Unit、Integration、Migration、Build和Package Smoke已通过；真实Electron \`state-proposal-workflow.spec.ts\`纳入最终Ready矩阵。
- M3-06转Implemented后进入延期最终验收；REQ-022同步为Implemented。REQ-045仍依赖M6-02一致性校验，保持In Progress。`,
    after: `## M3-06实现闭环

- 新增Schema 16、StateProposal、EndingSnapshot、DerivedInvalidation权威模型、六个具名IPC和作者裁决界面；Schema 17补齐StateProposal有限期终点持久化与数据库级区间约束。
- pending提案零权威写入；接受、编辑接受、拒绝、EntityState或ArcMilestone更新及快照重建遵循单事务和作者最终裁决。
- \`validUntilChapterId\`在合同、提案账本、接受/编辑接受与\`entity_states.valid_until_chapter_id\`之间完整保留；跨项目、同章、逆序或失效终点被拒绝，批量失败整批回滚。
- 旧章纯文字修订不传播；位置、事件、时间线、伏笔和弧光语义变化只使后续派生快照stale，读取自动回退权威当前表。
- Static、Unit、Integration、Migration、Build和Package Smoke已通过；真实Electron \`state-proposal-workflow.spec.ts\`与\`state-proposal-valid-until.spec.ts\`纳入最终Ready矩阵。
- 审计修复完成并通过主线验证前，M3-06保持In Progress、M3-07保持暂停；REQ-022不得提前恢复Implemented结论。REQ-045仍依赖M6-02一致性校验，保持In Progress。`,
  },
] as const;

test('exports documentation synchronized with the M3-06 finite interval contract', async () => {
  const outputRoot = process.env.WORLDFORGE_E2E_OUTPUT_DIR;
  expect(outputRoot).toBeTruthy();
  const output = path.join(outputRoot!, 'm3-06-doc-sync');
  await mkdir(output, { recursive: true });

  for (const replacement of replacements) {
    const source = await readFile(replacement.file, 'utf8');
    expect(source).toContain(replacement.before);
    const synchronized = source.replace(replacement.before, replacement.after);
    expect(synchronized).not.toBe(source);
    await writeFile(path.join(output, path.basename(replacement.file)), synchronized, 'utf8');
  }
});
