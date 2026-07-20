function trashStatus(message: string, error = false): void {
  const status = document.querySelector<HTMLElement>('[data-trash-status]');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

function blockerLabel(blocker: {
  readonly kind: 'version' | 'candidate' | 'chapter-reference';
  readonly count: number;
  readonly source?: string | undefined;
  readonly deleteAction?: string | undefined;
}): string {
  if (blocker.kind === 'version') return `Version ${blocker.count}项`;
  if (blocker.kind === 'candidate') return `Candidate ${blocker.count}项`;
  return `${blocker.source ?? '未知章节引用'} ${blocker.count}项（ON DELETE ${blocker.deleteAction ?? 'UNKNOWN'}）`;
}

function renderTrashEmptyStateAfterRemoval(row: HTMLElement): void {
  const list = row.closest<HTMLElement>('[data-trash-list]');
  row.remove();
  if (!list || list.querySelector('[data-trash-entry-id]')) return;
  const empty = document.createElement('p');
  empty.className = 'structure-empty';
  empty.dataset.trashEmpty = '';
  empty.textContent = '废纸篓为空。';
  list.replaceChildren(empty);
}

async function guardedPermanentDelete(button: HTMLButtonElement): Promise<void> {
  const row = button.closest<HTMLElement>('[data-trash-entry-id]');
  const trashEntryId = row?.dataset.trashEntryId;
  const title = row?.querySelector('strong')?.textContent?.trim();
  if (!row || !trashEntryId || !title) return;
  button.disabled = true;
  trashStatus('正在扫描全部章节外键引用…');
  try {
    const active = await window.worldforge.project.getActive();
    if (!active.ok || !active.data || active.data.databaseMode !== 'read-write') {
      trashStatus('当前项目不可执行永久删除。', true);
      return;
    }
    const preview = await window.worldforge.trash.previewPermanentDelete({
      projectId: active.data.projectId,
      trashEntryId,
    });
    if (!preview.ok) {
      trashStatus(`影响检查失败 · ${preview.error.code}`, true);
      return;
    }
    if (!preview.data.canDelete) {
      trashStatus(
        `不可永久删除：${preview.data.blockers.map(blockerLabel).join('；')}。请先迁移或解除这些引用。`,
        true,
      );
      return;
    }
    const impact = preview.data.impact;
    const confirmation = window.prompt(
      `永久删除“${title}”将删除 ${impact.volumes} 卷、${impact.chapters} 章、` +
        `${impact.drafts} 份Draft和 ${impact.draftBlocks} 个正文块。\n` +
        `全部章节外键已扫描且当前无引用；执行前会创建已验证恢复点。请输入完整标题以确认：`,
      '',
    );
    if (confirmation !== title) {
      trashStatus(
        confirmation === null ? '已取消永久删除。' : '标题不匹配，未删除。',
        confirmation !== null,
      );
      return;
    }
    const result = await window.worldforge.trash.permanentDelete({
      projectId: active.data.projectId,
      trashEntryId,
      planHash: preview.data.planHash,
      confirmationTitle: confirmation,
    });
    if (!result.ok) {
      trashStatus(`永久删除失败 · ${result.error.code}`, true);
      return;
    }
    renderTrashEmptyStateAfterRemoval(row);
    trashStatus(`已永久删除 · 恢复点 ${result.data.backupId.slice(0, 8)}`);
  } catch {
    trashStatus('永久删除失败 · COMMON_INTERNAL_999', true);
  } finally {
    button.disabled = false;
  }
}

document.addEventListener(
  'click',
  (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-permanent-delete]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void guardedPermanentDelete(button);
  },
  true,
);
