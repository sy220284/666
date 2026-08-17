import { randomUUID } from 'node:crypto';

import {
  ConstraintPackageSchema,
  ConstraintSourceSchema,
  type ConstraintPackage,
  type ConstraintPackageBuildInput,
  type ConstraintPriority,
  type ConstraintSource,
  type ConstraintSourceType,
} from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import { applyConstraintAuthorityPolicy } from '../../packages/core-service/src/constraint-package-authority.js';
import type { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const projectId = randomUUID();
const chapter1 = randomUUID();
const chapter2 = randomUUID();
const chapter3 = randomUUID();

function source(input: {
  sourceType: ConstraintSourceType;
  sourceId: string;
  semanticKey?: string;
  content?: string;
  priority?: ConstraintPriority;
  relevance?: number;
  id?: string;
  sourceVersionId?: string | null;
}): ConstraintSource {
  const content = input.content ?? JSON.stringify({ label: input.sourceId });
  return ConstraintSourceSchema.parse({
    id: input.id ?? `${input.sourceType}:${input.sourceId}`,
    priority: input.priority ?? 'P2',
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceVersionId: input.sourceVersionId ?? null,
    chapterId: chapter2,
    entityId: null,
    semanticKey: input.semanticKey ?? `${input.sourceType}:${input.sourceId}`,
    label: input.sourceId,
    content,
    relevance: input.relevance ?? 0.8,
    required: false,
    temporalStatus: 'current',
    estimatedTokens: 20,
    contentHash: input.sourceId
      .padEnd(64, 'a')
      .slice(0, 64)
      .replace(/[^0-9a-f]/gu, 'a'),
  });
}

function packageWith(
  sources: readonly ConstraintSource[],
  taskType = 'chapter',
): ConstraintPackage {
  const sections = { P0: [], P1: [], P2: [], P3: [], P4: [] } as Record<
    ConstraintPriority,
    ConstraintSource[]
  >;
  for (const item of sources) sections[item.priority].push(item);
  return ConstraintPackageSchema.parse({
    projectId,
    chapterId: chapter2,
    taskType,
    snapshotSource: 'fallback_live_query',
    sections,
    sourceVersionIds: [],
    estimatedTokens: 0,
    budget: { maxInputTokens: 50_000, safetyMarginTokens: 1_000, usableTokens: 49_000 },
    contentHash: 'a'.repeat(64),
    constraintHash: 'b'.repeat(64),
    trimLog: [],
    conflicts: [],
  });
}

function input(taskType: ConstraintPackageBuildInput['taskType'] = 'chapter') {
  return contractInput<ConstraintPackageBuildInput>({
    projectId,
    chapterId: chapter2,
    taskType,
    maxInputTokens: 50_000,
    safetyMarginTokens: 1_000,
    maxSupplementalResults: 0,
  });
}

interface ProjectionRows {
  chapters?: readonly Record<string, unknown>[];
  archivedEntities?: readonly Record<string, unknown>[];
  archivedCanonFacts?: readonly Record<string, unknown>[];
  foreshadowing?: Readonly<Record<string, readonly Record<string, unknown>[]>>;
}

function workspace(rows: ProjectionRows = {}): ProjectWorkspaceService {
  const chapterRows = rows.chapters ?? [{ id: chapter1 }, { id: chapter2 }, { id: chapter3 }];
  const archivedEntities = rows.archivedEntities ?? [];
  const archivedCanonFacts = rows.archivedCanonFacts ?? [];
  const foreshadowing = rows.foreshadowing ?? {};
  const prepare = vi.fn((sql: string) => ({
    all: vi.fn((...args: unknown[]) => {
      if (sql.includes('FROM chapters chapter')) return chapterRows;
      if (sql.includes('FROM scene_beat_entities')) return archivedEntities;
      if (sql.includes('FROM canon_facts')) return archivedCanonFacts;
      if (sql.includes('FROM foreshadowing_chapters')) {
        return foreshadowing[String(args[1])] ?? [];
      }
      throw new Error(`UNEXPECTED_SQL:${sql}`);
    }),
  }));
  const connection = contractInput({ prepare });
  return contractInput<ProjectWorkspaceService>({
    readProject: (_requestedProjectId: string, operation: (value: unknown) => unknown) =>
      operation(connection),
  });
}

function parsedContent(item: ConstraintSource | undefined): Record<string, unknown> {
  if (!item) throw new Error('Expected constraint source.');
  return contractInput<Record<string, unknown>>(JSON.parse(item.content));
}

describe('constraint package authority edge coverage', () => {
  it('projects role history, future arcs, archived references, deduplication and conflicts', () => {
    const versionId = randomUUID();
    const foreshadowingSources = [
      source({ sourceType: 'foreshadowing', sourceId: 'fs-none' }),
      source({ sourceType: 'foreshadowing', sourceId: 'fs-plant' }),
      source({ sourceType: 'foreshadowing', sourceId: 'fs-reinforce' }),
      source({ sourceType: 'foreshadowing', sourceId: 'fs-partial' }),
      source({ sourceType: 'foreshadowing', sourceId: 'fs-reveal' }),
      source({ sourceType: 'foreshadowing', sourceId: 'fs-other' }),
      source({ sourceType: 'foreshadowing', sourceId: 'fs-upcoming' }),
      source({ sourceType: 'foreshadowing', sourceId: 'fs-text', content: 'not-json' }),
    ];
    const arcs = [
      source({ sourceType: 'character_arc', sourceId: 'arc-text', content: 'not-json' }),
      source({ sourceType: 'character_arc', sourceId: 'arc-array', content: '[]' }),
      source({
        sourceType: 'character_arc',
        sourceId: 'arc-no-milestones',
        content: JSON.stringify({ goal: 'stay' }),
      }),
      source({
        sourceType: 'character_arc',
        sourceId: 'arc-mixed',
        sourceVersionId: versionId,
        content: JSON.stringify({
          milestones: [
            'literal',
            { status: 'hit', actualChapterId: chapter3, plannedChapterId: chapter1 },
            { status: 'skipped', plannedChapterId: chapter3 },
            { status: 'working', plannedChapterId: chapter1 },
            { actualChapterId: 42, plannedChapterId: chapter3 },
            {},
          ],
        }),
      }),
    ];
    const duplicateLow = source({
      sourceType: 'supplemental_search',
      sourceId: 'duplicate-low',
      id: 'duplicate-id',
      semanticKey: 'duplicate-key',
      relevance: 0.1,
      priority: 'P3',
    });
    const duplicateHigh = source({
      sourceType: 'supplemental_search',
      sourceId: 'duplicate-high',
      id: 'duplicate-id',
      semanticKey: 'duplicate-key',
      relevance: 0.9,
      priority: 'P3',
    });
    const duplicateLowerAgain = source({
      sourceType: 'supplemental_search',
      sourceId: 'duplicate-lower-again',
      id: 'duplicate-id',
      semanticKey: 'duplicate-key',
      relevance: 0.2,
      priority: 'P3',
    });
    const conflictA = source({
      sourceType: 'supplemental_search',
      sourceId: 'conflict-a',
      semanticKey: 'same-semantic-key',
      priority: 'P4',
    });
    const conflictB = source({
      sourceType: 'supplemental_search',
      sourceId: 'conflict-b',
      semanticKey: 'same-semantic-key',
      priority: 'P4',
    });
    const conflictC = source({
      sourceType: 'supplemental_search',
      sourceId: 'conflict-c',
      semanticKey: 'another-semantic-key',
      priority: 'P4',
    });
    const conflictD = source({
      sourceType: 'supplemental_search',
      sourceId: 'conflict-d',
      semanticKey: 'another-semantic-key',
      priority: 'P4',
    });
    const currentDraft = source({ sourceType: 'current_draft', sourceId: 'draft' });

    const archivedEntityId = randomUUID();
    const authorityWorkspace = workspace({
      archivedEntities: [
        {
          id: archivedEntityId,
          entityType: 'character',
          name: '归档人物',
          aliasesJson: null,
          summary: '仍被当前场景引用',
        },
        {
          id: randomUUID(),
          entityType: 'location',
          name: '旧地点',
          aliasesJson: JSON.stringify(['旧称', 7]),
          summary: '历史地点',
        },
      ],
      archivedCanonFacts: [
        {
          id: randomUUID(),
          entityId: archivedEntityId,
          factKey: 'weapon',
          valueJson: 'not-json',
          description: '旧刀',
        },
      ],
      foreshadowing: {
        'fs-none': [],
        'fs-plant': [{ role: 'plant', chapterId: chapter1 }],
        'fs-reinforce': [{ role: 'reinforce', chapterId: chapter1 }],
        'fs-partial': [{ role: 'partial_reveal', chapterId: chapter1 }],
        'fs-reveal': [{ role: 'reveal', chapterId: chapter2 }],
        'fs-other': [{ role: 'unexpected-role', chapterId: chapter1 }],
        'fs-upcoming': [{ role: 'plant', chapterId: chapter3 }],
        'fs-text': [{ role: 'plant', chapterId: chapter1 }],
      },
    });

    const base = packageWith([
      ...foreshadowingSources,
      ...arcs,
      duplicateLow,
      duplicateHigh,
      duplicateLowerAgain,
      conflictA,
      conflictB,
      conflictC,
      conflictD,
      currentDraft,
    ]);
    const result = applyConstraintAuthorityPolicy(authorityWorkspace, input('chapter'), base);
    const sources = Object.values(result.sections).flat();

    expect(parsedContent(sources.find((item) => item.sourceId === 'fs-none')).status).toBe(
      'planned',
    );
    expect(parsedContent(sources.find((item) => item.sourceId === 'fs-plant')).status).toBe(
      'planted',
    );
    expect(parsedContent(sources.find((item) => item.sourceId === 'fs-reinforce')).status).toBe(
      'reinforced',
    );
    expect(parsedContent(sources.find((item) => item.sourceId === 'fs-partial')).status).toBe(
      'partially_revealed',
    );
    expect(parsedContent(sources.find((item) => item.sourceId === 'fs-reveal')).status).toBe(
      'revealed',
    );
    expect(parsedContent(sources.find((item) => item.sourceId === 'fs-other')).status).toBe(
      'planned',
    );
    expect(sources.find((item) => item.sourceId === 'fs-upcoming')?.temporalStatus).toBe(
      'upcoming',
    );
    expect(sources.find((item) => item.sourceId === 'fs-text')?.content).toBe('not-json');

    const mixed = parsedContent(sources.find((item) => item.sourceId === 'arc-mixed'));
    expect(mixed.milestones).toEqual([
      'literal',
      expect.objectContaining({
        status: 'planned',
        actualChapterId: null,
        temporalStatus: 'upcoming',
      }),
      expect.objectContaining({
        status: 'planned',
        actualChapterId: null,
        temporalStatus: 'upcoming',
      }),
      expect.objectContaining({ status: 'working', temporalStatus: 'current' }),
      expect.objectContaining({
        status: 'planned',
        actualChapterId: null,
        temporalStatus: 'upcoming',
      }),
      expect.objectContaining({ temporalStatus: 'current' }),
    ]);
    expect(sources.find((item) => item.sourceId === 'arc-text')?.content).toBe('not-json');
    expect(sources.find((item) => item.sourceId === 'arc-array')?.content).toBe('[]');

    expect(sources.filter((item) => item.id === 'duplicate-id')).toHaveLength(1);
    expect(sources.find((item) => item.id === 'duplicate-id')?.sourceId).toBe('duplicate-high');
    expect(result.conflicts.some((item) => item.semanticKey === 'same-semantic-key')).toBe(true);
    expect(result.sourceVersionIds).toContain(versionId);
    expect(
      sources.some((item) => item.sourceType === 'entity' && item.entityId === archivedEntityId),
    ).toBe(true);
    expect(
      sources.some(
        (item) => item.sourceType === 'canon_fact' && item.entityId === archivedEntityId,
      ),
    ).toBe(true);
    expect(sources.some((item) => item.sourceType === 'current_draft')).toBe(true);

    const validated = applyConstraintAuthorityPolicy(
      authorityWorkspace,
      input('validate'),
      packageWith([currentDraft], 'validate'),
    );
    expect(Object.values(validated.sections).flat()).not.toContainEqual(
      expect.objectContaining({ sourceType: 'current_draft' }),
    );
  });

  it('rejects a missing target chapter and invalid database row text', () => {
    const packageValue = packageWith([]);
    expect(() =>
      applyConstraintAuthorityPolicy(
        workspace({ chapters: [{ id: chapter1 }] }),
        input(),
        packageValue,
      ),
    ).toThrow('CONSTRAINT_AUTHORITY_TARGET_CHAPTER_NOT_FOUND');

    expect(() =>
      applyConstraintAuthorityPolicy(
        workspace({ chapters: [{ id: 42 }, { id: chapter2 }] }),
        input(),
        packageValue,
      ),
    ).toThrow('CONSTRAINT_AUTHORITY_INVALID_chapter.id');
  });
});
