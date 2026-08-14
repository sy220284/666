import type { ResearchReference } from '@worldforge/contracts';

const MAX_REFERENCES = 20;
const selections = new Map<string, readonly ResearchReference[]>();

export function researchReferenceKey(reference: ResearchReference): string {
  return `${reference.sourceType}:${reference.sourceId}`;
}

export function listResearchReferenceSelection(projectId: string): ResearchReference[] {
  return [...(selections.get(projectId) ?? [])];
}

export function setResearchReferenceSelected(
  projectId: string,
  reference: ResearchReference,
  selected: boolean,
): readonly ResearchReference[] {
  const current = selections.get(projectId) ?? [];
  const key = researchReferenceKey(reference);
  const withoutReference = current.filter((item) => researchReferenceKey(item) !== key);
  const next = selected
    ? [...withoutReference, reference].slice(-MAX_REFERENCES)
    : withoutReference;
  if (next.length === 0) selections.delete(projectId);
  else selections.set(projectId, next);
  return next;
}

export function removeResearchReferenceSelection(
  projectId: string,
  reference: ResearchReference,
): readonly ResearchReference[] {
  return setResearchReferenceSelected(projectId, reference, false);
}

export function consumeResearchReferenceSelection(
  projectId: string,
  consumed: readonly ResearchReference[],
): readonly ResearchReference[] {
  if (consumed.length === 0) return listResearchReferenceSelection(projectId);
  const consumedKeys = new Set(consumed.map(researchReferenceKey));
  const next = (selections.get(projectId) ?? []).filter(
    (reference) => !consumedKeys.has(researchReferenceKey(reference)),
  );
  if (next.length === 0) selections.delete(projectId);
  else selections.set(projectId, next);
  return next;
}
