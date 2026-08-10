import type { Chapter, LifecycleStatus, StructureOperationPreview } from '@worldforge/contracts';

export function nullableNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim();
  return text ? Number(text) : null;
}

export function statusLabel(status: LifecycleStatus): string {
  return {
    pending: '待规划',
    outlined: '已规划',
    writing: '写作中',
    reviewing: '审阅中',
    finalized: '已定稿',
  }[status];
}

export function chapterMeta(chapter: Chapter): string {
  const range =
    chapter.targetWordMin === null && chapter.targetWordMax === null
      ? ''
      : ` · ${chapter.targetWordMin ?? 0}—${chapter.targetWordMax ?? '∞'} 字`;
  return `${statusLabel(chapter.status)}${range}`;
}

export function previewMessage(preview: StructureOperationPreview): string {
  const lockNotice = preview.lockedLogicalBlockIds.length
    ? ` · 锁定段落 ${preview.lockedLogicalBlockIds.length}`
    : '';
  const warnings = preview.warnings.length ? ` · ${preview.warnings.join('；')}` : '';
  return `影响正文段落 ${preview.movedLogicalBlockIds.length} · 源章 ${preview.sourceBlockCount}→${preview.resultingSourceBlockCount} · 目标章 ${preview.targetBlockCount}→${preview.resultingTargetBlockCount}${lockNotice}${warnings}`;
}
