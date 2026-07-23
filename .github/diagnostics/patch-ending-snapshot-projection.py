from pathlib import Path
import re


def regex(path: str, pattern: str, replacement: str, count: int = 1) -> None:
    file = Path(path)
    source, actual = re.subn(pattern, replacement, file.read_text(), count=count, flags=re.S)
    if actual != count:
        raise SystemExit(f'{path}: expected {count} regex replacement(s), found {actual}')
    file.write_text(source)


def literal(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    source = file.read_text()
    actual = source.count(old)
    if actual != count:
        raise SystemExit(f'{path}: expected {count} literal match(es), found {actual}')
    file.write_text(source.replace(old, new, count))


state_proposal = 'packages/core-service/src/state-proposal.ts'
replacement = r'''type ChapterPosition = ReturnType<typeof chapterPosition>;

type HistoricalForeshadowingStatus =
  | 'planted'
  | 'reinforced'
  | 'partially_revealed'
  | 'revealed';

interface ForeshadowingEventRow {
  readonly id: string;
  readonly chapterId: string;
  readonly role: 'plant' | 'reinforce' | 'partial_reveal' | 'reveal';
}

function chapterPositions(
  connection: DatabaseSync,
  projectId: string,
): ReadonlyMap<string, ChapterPosition> {
  const rows = connection
    .prepare(
      `SELECT c.id AS chapterId, volume.order_key AS volumeOrder,
              c.order_key AS chapterOrder
         FROM chapters c
         JOIN volumes volume ON volume.id = c.volume_id
        WHERE volume.project_id = ?
          AND c.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .all(projectId) as unknown as {
    readonly chapterId: string;
    readonly volumeOrder: number | bigint;
    readonly chapterOrder: number | bigint;
  }[];
  return new Map(
    rows.map((row) => [
      row.chapterId,
      [Number(row.volumeOrder), Number(row.chapterOrder)] as ChapterPosition,
    ]),
  );
}

function requiredPosition(
  positions: ReadonlyMap<string, ChapterPosition>,
  chapterId: string,
): ChapterPosition {
  const position = positions.get(chapterId);
  if (!position) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_INVARIANT',
      'EndingSnapshot references a Chapter outside the active project structure.',
    );
  }
  return position;
}

function effectiveAt(
  positions: ReadonlyMap<string, ChapterPosition>,
  target: ChapterPosition,
  startChapterId: string,
  endChapterId: string | null,
): boolean {
  const start = requiredPosition(positions, startChapterId);
  if (compareChapterPosition(start, target) > 0) return false;
  if (!endChapterId) return true;
  return compareChapterPosition(target, requiredPosition(positions, endChapterId)) < 0;
}

const foreshadowingRole = {
  plant: { status: 'planted', rank: 1 },
  reinforce: { status: 'reinforced', rank: 2 },
  partial_reveal: { status: 'partially_revealed', rank: 3 },
  reveal: { status: 'revealed', rank: 4 },
} as const satisfies Record<
  ForeshadowingEventRow['role'],
  { readonly status: HistoricalForeshadowingStatus; readonly rank: number }
>;

function historicalForeshadowings(
  connection: DatabaseSync,
  projectId: string,
  positions: ReadonlyMap<string, ChapterPosition>,
  target: ChapterPosition,
): Array<{ readonly id: string; readonly status: HistoricalForeshadowingStatus }> {
  const rows = connection
    .prepare(
      `SELECT f.id, link.chapter_id AS chapterId, link.role
         FROM foreshadowings f
         JOIN foreshadowing_chapters link ON link.foreshadowing_id = f.id
        WHERE f.project_id = ?
          AND link.role IN ('plant', 'reinforce', 'partial_reveal', 'reveal')
        ORDER BY f.id, link.chapter_id, link.role`,
    )
    .all(projectId) as unknown as ForeshadowingEventRow[];
  const latest = new Map<
    string,
    {
      readonly position: ChapterPosition;
      readonly rank: number;
      readonly status: HistoricalForeshadowingStatus;
    }
  >();
  for (const row of rows) {
    const position = requiredPosition(positions, row.chapterId);
    if (compareChapterPosition(position, target) > 0) continue;
    const event = foreshadowingRole[row.role];
    const current = latest.get(row.id);
    const ordering = current ? compareChapterPosition(position, current.position) : 1;
    if (!current || ordering > 0 || (ordering === 0 && event.rank > current.rank)) {
      latest.set(row.id, { position, rank: event.rank, status: event.status });
    }
  }
  return [...latest.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([id, event]) => ({ id, status: event.status }));
}

function historicalArcMilestones(
  connection: DatabaseSync,
  projectId: string,
  positions: ReadonlyMap<string, ChapterPosition>,
  target: ChapterPosition,
) {
  const rows = connection
    .prepare(
      `SELECT id, status, planned_chapter_id AS plannedChapterId,
              actual_chapter_id AS actualChapterId
         FROM arc_milestones
        WHERE project_id = ? AND status IN ('hit', 'skipped')
        ORDER BY id`,
    )
    .all(projectId) as unknown as {
    readonly id: string;
    readonly status: 'hit' | 'skipped';
    readonly plannedChapterId: string | null;
    readonly actualChapterId: string | null;
  }[];
  return rows
    .filter((row) => {
      const effectiveChapterId = row.actualChapterId ?? row.plannedChapterId;
      return (
        effectiveChapterId !== null &&
        compareChapterPosition(requiredPosition(positions, effectiveChapterId), target) <= 0
      );
    })
    .map(({ id, status, actualChapterId }) => ({ id, status, actualChapterId }));
}

function snapshotContent(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
): EndingSnapshotContent {
  const target = chapterPosition(connection, projectId, chapterId);
  const positions = chapterPositions(connection, projectId);
  const entityRows = connection
    .prepare(
      `SELECT entity_id AS entityId, state_key AS stateKey, value_json AS valueJson,
              source_version_id AS sourceVersionId,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId
         FROM entity_states
        WHERE project_id = ? AND record_status = 'current'
        ORDER BY entity_id, state_key`,
    )
    .all(projectId) as unknown as {
    readonly entityId: string;
    readonly stateKey: string;
    readonly valueJson: string;
    readonly sourceVersionId: string;
    readonly validFromChapterId: string;
    readonly validUntilChapterId: string | null;
  }[];
  const knowledgeRows = connection
    .prepare(
      `SELECT character_id AS characterId, information_key AS informationKey,
              knowledge_status AS knowledgeStatus,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId
         FROM knowledge_states
        WHERE project_id = ? AND record_status = 'current'
        ORDER BY character_id, information_key`,
    )
    .all(projectId) as unknown as {
    readonly characterId: string;
    readonly informationKey: string;
    readonly knowledgeStatus: string;
    readonly validFromChapterId: string;
    readonly validUntilChapterId: string | null;
  }[];
  return EndingSnapshotContentSchema.parse({
    entityStates: entityRows
      .filter((row) =>
        effectiveAt(positions, target, row.validFromChapterId, row.validUntilChapterId),
      )
      .map((row) => ({
        entityId: row.entityId,
        stateKey: row.stateKey,
        value: parseJson(row.valueJson),
        sourceVersionId: row.sourceVersionId,
      })),
    knowledgeStates: knowledgeRows
      .filter((row) =>
        effectiveAt(positions, target, row.validFromChapterId, row.validUntilChapterId),
      )
      .map((row) => ({
        characterId: row.characterId,
        informationKey: row.informationKey,
        knowledgeStatus: row.knowledgeStatus,
      })),
    foreshadowings: historicalForeshadowings(connection, projectId, positions, target),
    arcMilestones: historicalArcMilestones(connection, projectId, positions, target),
  });
}

function snapshotRow'''
regex(
    state_proposal,
    r"function effectiveAt\([\s\S]*?\nfunction snapshotRow",
    replacement,
)

migration_test = 'tests/migration/final-coordination-remediation.test.ts'
literal(
    migration_test,
    "it('keeps unplanted future plans out of history and invalidates from the linked chapter', async () => {",
    "it('invalidates snapshots from the first linked chapter for a newly linked foreshadowing', async () => {",
)
regex(
    migration_test,
    r"\n      for \(const snapshotId of ids\.snapshotIds\) \{[\s\S]*?\n      \}\n\n      const middle",
    "\n\n      const middle",
)

Path('tests/integration/ending-snapshot-temporal-projection.test.ts').write_text(r'''import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
  type ContinuityHarness,
} from './continuity-hardening-harness.js';

const openHarnesses: ContinuityHarness[] = [];

afterEach(async () => {
  await Promise.all(openHarnesses.splice(0).map(closeContinuityHarness));
  await cleanupContinuityHarnesses();
});

async function finalVersionFor(
  value: ContinuityHarness,
  projectId: string,
  chapterId: string,
  title: string,
) {
  const draft = await value.drafts.open(randomUUID(), { projectId, chapterId });
  const version = await value.versions.create(randomUUID(), {
    projectId,
    chapterId,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    title,
  });
  await value.versions.setFinal(randomUUID(), {
    projectId,
    chapterId,
    versionId: version.versionId,
  });
  return version;
}

describe('EndingSnapshot temporal projection', () => {
  it('derives foreshadowing events and ArcMilestones at the target chapter', async () => {
    const value = await createContinuityHarness();
    openHarnesses.push(value);
    const seeded = await seedContinuity(value);
    await value.versions.setFinal(randomUUID(), {
      projectId: seeded.project.projectId,
      chapterId: seeded.chapter1.id,
      versionId: seeded.version.versionId,
    });
    const chapter2Version = await finalVersionFor(
      value,
      seeded.project.projectId,
      seeded.chapter2.id,
      '第二章定稿',
    );
    const chapter3Version = await finalVersionFor(
      value,
      seeded.project.projectId,
      seeded.chapter3.id,
      '第三章定稿',
    );

    let planning = await value.narrative.saveForeshadowing(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      foreshadowingId: null,
      title: '未种下的未来计划',
      description: '',
      revealFromChapterId: null,
      revealByChapterId: null,
      chapterLinks: [],
      relations: [],
    });
    const futurePlan = planning.foreshadowings.find(
      (item) => item.title === '未种下的未来计划',
    )!;

    planning = await value.narrative.saveForeshadowing(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      foreshadowingId: null,
      title: '分章推进的伏笔',
      description: '',
      revealFromChapterId: null,
      revealByChapterId: null,
      chapterLinks: [
        { chapterId: seeded.chapter2.id, role: 'plant' },
        { chapterId: seeded.chapter3.id, role: 'reinforce' },
      ],
      relations: [],
    });
    const stagedForeshadowing = planning.foreshadowings.find(
      (item) => item.title === '分章推进的伏笔',
    )!;
    await value.narrative.transitionForeshadowing(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      foreshadowingId: stagedForeshadowing.id,
      status: 'planted',
    });
    await value.narrative.transitionForeshadowing(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      foreshadowingId: stagedForeshadowing.id,
      status: 'reinforced',
    });

    planning = await value.narrative.saveCharacterArc(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      arcId: null,
      characterId: seeded.character.id,
      title: '成长弧',
      arcType: 'growth',
      customType: null,
      status: 'active',
      authorIntent: '',
    });
    const arc = planning.characterArcs.find((item) => item.title === '成长弧')!;
    planning = await value.narrative.saveArcMilestone(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      milestoneId: null,
      arcId: arc.id,
      title: '第二章命中',
      description: '',
      sortIndex: 0,
      plannedChapterId: seeded.chapter2.id,
      dependencyMilestoneIds: [],
      dependencyTimelineEventIds: [],
    });
    const hitMilestone = planning.characterArcs
      .find((item) => item.id === arc.id)!
      .milestones.find((item) => item.title === '第二章命中')!;
    await value.narrative.transitionArcMilestone(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      milestoneId: hitMilestone.id,
      status: 'hit',
      actualChapterId: seeded.chapter2.id,
    });

    planning = await value.narrative.saveArcMilestone(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      milestoneId: null,
      arcId: arc.id,
      title: '第三章跳过',
      description: '',
      sortIndex: 1,
      plannedChapterId: seeded.chapter3.id,
      dependencyMilestoneIds: [],
      dependencyTimelineEventIds: [],
    });
    const skippedMilestone = planning.characterArcs
      .find((item) => item.id === arc.id)!
      .milestones.find((item) => item.title === '第三章跳过')!;
    await value.narrative.transitionArcMilestone(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      milestoneId: skippedMilestone.id,
      status: 'skipped',
      actualChapterId: null,
    });

    const first = await value.proposals.refreshSnapshot(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      chapterId: seeded.chapter1.id,
      sourceVersionId: seeded.version.versionId,
    });
    const second = await value.proposals.refreshSnapshot(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      chapterId: seeded.chapter2.id,
      sourceVersionId: chapter2Version.versionId,
    });
    const third = await value.proposals.refreshSnapshot(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      chapterId: seeded.chapter3.id,
      sourceVersionId: chapter3Version.versionId,
    });

    expect(first.content.foreshadowings).toEqual([]);
    expect(first.content.arcMilestones).toEqual([]);
    expect(second.content.foreshadowings).toEqual([
      { id: stagedForeshadowing.id, status: 'planted' },
    ]);
    expect(second.content.arcMilestones).toEqual([
      { id: hitMilestone.id, status: 'hit', actualChapterId: seeded.chapter2.id },
    ]);
    expect(third.content.foreshadowings).toEqual([
      { id: stagedForeshadowing.id, status: 'reinforced' },
    ]);
    expect(third.content.arcMilestones).toEqual(
      [
        { id: hitMilestone.id, status: 'hit', actualChapterId: seeded.chapter2.id },
        { id: skippedMilestone.id, status: 'skipped', actualChapterId: null },
      ].sort((left, right) => left.id.localeCompare(right.id, 'en')),
    );
    expect(first.content.foreshadowings).not.toContainEqual(
      expect.objectContaining({ id: futurePlan.id }),
    );
  });
});
''')

architecture = Path('docs/architecture/M0_M3_FINAL_REMEDIATION.md')
source = architecture.read_text()
section = r'''

## EndingSnapshot真实历史投影

EndingSnapshot刷新必须调用真实投影逻辑验证时间边界。伏笔只依据目标章节及之前的`plant/reinforce/partial_reveal/reveal`链接推导历史状态；没有叙事事件的planned伏笔不进入快照。ArcMilestone只在`actualChapterId ?? plannedChapterId`不晚于目标章节时进入快照。迁移触发器测试只负责验证失效范围，不能以手工空`content_json`替代投影验收。
'''
if '## EndingSnapshot真实历史投影' not in source:
    architecture.write_text(source.rstrip() + section + '\n')
