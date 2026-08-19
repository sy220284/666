import { useEffect, useMemo, useState } from 'react';

import type { ResearchTargetType } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { runIdeaCapsuleOperation } from '../../bridge/idea-capsule-client.js';

export interface ResearchTargetOption {
  readonly type: ResearchTargetType;
  readonly id: string;
  readonly label: string;
}

export function useResearchTargetOptions(
  bridge: RendererBridgeAdapter,
  projectId: string,
): readonly ResearchTargetOption[] {
  const [options, setOptions] = useState<readonly ResearchTargetOption[]>([]);

  useEffect(() => {
    let active = true;
    const planning = bridge.planning?.listStructure
      ? bridge.planning.listStructure(projectId, { mode: 'replace' }).catch(() => null)
      : Promise.resolve(null);
    const canon = bridge.canon?.list
      ? bridge.canon
          .list({ projectId, includeArchived: false }, { mode: 'replace' })
          .catch(() => null)
      : Promise.resolve(null);
    const continuity = bridge.continuity?.list
      ? bridge.continuity
          .list(
            {
              projectId,
              query: '',
              includeHistory: true,
              includeArchivedEvents: false,
              effectiveAtChapterId: null,
            },
            { mode: 'replace' },
          )
          .catch(() => null)
      : Promise.resolve(null);
    const narrative = bridge.narrativePlanning?.list
      ? bridge.narrativePlanning
          .list(
            { projectId, query: '', includeResolved: true, referenceChapterId: null },
            { mode: 'replace' },
          )
          .catch(() => null)
      : Promise.resolve(null);
    const ideas =
      typeof window !== 'undefined' && window.worldforgeIdeaCapsule
        ? runIdeaCapsuleOperation(
            {
              operation: 'idea.list',
              input: { projectId, status: null, limit: 100, cursor: null },
            },
            { mode: 'replace' },
          ).catch(() => null)
        : Promise.resolve(null);

    void Promise.all([planning, canon, continuity, narrative, ideas]).then(
      ([structureOutcome, canonOutcome, continuityOutcome, narrativeOutcome, ideaOutcome]) => {
        if (!active) return;
        const next: ResearchTargetOption[] = [];
        const structure = structureOutcome?.state === 'success' ? structureOutcome.data : null;
        for (const volume of structure?.volumes ?? []) {
          next.push({ type: 'volume', id: volume.id, label: volume.title });
          for (const chapter of volume.chapters) {
            next.push({
              type: 'chapter',
              id: chapter.id,
              label: `${volume.title} / ${chapter.title}`,
            });
          }
        }

        const entities = canonOutcome?.state === 'success' ? canonOutcome.data.entities : [];
        const entityNames = new Map(entities.map((entity) => [entity.id, entity.name] as const));
        for (const entity of entities) {
          next.push({ type: 'entity', id: entity.id, label: entity.name });
        }

        const continuityCatalog =
          continuityOutcome?.state === 'success' ? continuityOutcome.data : null;
        for (const event of continuityCatalog?.timelineEvents ?? []) {
          next.push({ type: 'timeline', id: event.id, label: event.title });
        }
        for (const relationship of continuityCatalog?.relationships ?? []) {
          const from = entityNames.get(relationship.fromCharacterId) ?? '人物';
          const to = entityNames.get(relationship.toCharacterId) ?? '人物';
          next.push({
            type: 'relationship',
            id: relationship.id,
            label: `${from} → ${to} · ${relationship.label}`,
          });
        }

        const narrativeCatalog =
          narrativeOutcome?.state === 'success' ? narrativeOutcome.data : null;
        for (const foreshadowing of narrativeCatalog?.foreshadowings ?? []) {
          next.push({ type: 'foreshadowing', id: foreshadowing.id, label: foreshadowing.title });
        }
        for (const arc of narrativeCatalog?.characterArcs ?? []) {
          next.push({ type: 'arc', id: arc.id, label: arc.title });
          for (const milestone of arc.milestones) {
            next.push({
              type: 'milestone',
              id: milestone.id,
              label: `${arc.title} / ${milestone.title}`,
            });
          }
        }

        if (ideaOutcome?.state === 'success' && 'ideas' in ideaOutcome.data) {
          for (const idea of ideaOutcome.data.ideas) {
            next.push({ type: 'idea', id: idea.id, label: idea.title });
          }
        }
        setOptions(next);
      },
    );

    return () => {
      active = false;
    };
  }, [bridge, projectId]);

  return useMemo(
    () => [...options].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
    [options],
  );
}
