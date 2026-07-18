import type {
  CandidateConflictItem,
  CandidatePreview,
  CandidateSelection,
  CandidateUndoPreview,
} from '@worldforge/contracts';

interface CandidateContext {
  readonly projectId: string;
  readonly chapterId: string;
}

interface CandidateActionUiOptions {
  readonly context: () => Promise<CandidateContext | null>;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}

function checkedValues(root: HTMLElement, name: string): string[] {
  return [...root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map(
    (input) => input.value,
  );
}

async function safely<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch {
    return null;
  }
}

export function setupCandidateApplyUi(options: CandidateActionUiOptions): () => void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-candidate-preview-dialog]');
  const candidateSelect = document.querySelector<HTMLSelectElement>(
    '[data-candidate-preview-select]',
  );
  if (!dialog || !candidateSelect) return () => undefined;

  const panel = node('section');
  panel.dataset.candidateApplyPanel = '';
  panel.style.marginTop = '16px';
  panel.style.paddingTop = '16px';
  panel.style.borderTop = '1px solid currentColor';

  const mode = node('select');
  mode.dataset.candidateApplyMode = '';
  mode.setAttribute('aria-label', '候选内容使用范围');
  for (const [value, label] of [
    ['all', '整稿'],
    ['blocks', '按块'],
    ['scene-beats', '按SceneBeat'],
  ] as const) {
    const option = node('option', label);
    option.value = value;
    mode.append(option);
  }

  const submit = node('button', '采用所选内容');
  submit.type = 'button';
  submit.dataset.applyCandidate = '';
  submit.disabled = true;

  const undo = node('button', '撤销本次应用');
  undo.type = 'button';
  undo.dataset.undoCandidateApply = '';
  undo.hidden = true;
  undo.disabled = true;

  const status = node('p', '请选择候选内容。');
  status.dataset.candidateApplyStatus = '';
  status.setAttribute('role', 'status');

  const choices = node('div');
  choices.dataset.candidateApplyChoices = '';
  choices.style.display = 'grid';
  choices.style.gap = '8px';

  const conflicts = node('ul');
  conflicts.dataset.candidateConflictList = '';
  conflicts.setAttribute('aria-label', '候选内容冲突');

  const label = node('label', '范围 ');
  label.append(mode);
  panel.append(node('h3', '采用候选内容'), label, submit, undo, status, choices, conflicts);
  dialog.append(panel);

  let preview: CandidatePreview | null = null;
  let undoPreview: CandidateUndoPreview | null = null;
  let refreshId = 0;

  const renderConflicts = (items: readonly CandidateConflictItem[]): void => {
    conflicts.replaceChildren();
    for (const conflict of items) {
      conflicts.append(node('li', `${conflict.kind} · ${conflict.message}`));
    }
  };

  const buildSelection = (): CandidateSelection | null => {
    if (!preview) return null;
    if (mode.value === 'all') return { mode: 'all' };
    if (mode.value === 'blocks') {
      const candidateBlockIds = checkedValues(choices, 'candidate-block-choice');
      return candidateBlockIds.length
        ? { mode: 'blocks', candidateBlockIds, deleteLogicalBlockIds: [] }
        : null;
    }
    const beatIds = checkedValues(choices, 'candidate-beat-choice');
    return beatIds.length ? { mode: 'scene-beats', beatIds, deleteLogicalBlockIds: [] } : null;
  };

  const render = (): void => {
    choices.replaceChildren();
    if (!preview) {
      submit.disabled = true;
      undo.hidden = true;
      undo.disabled = true;
      return;
    }

    const all = mode.querySelector<HTMLOptionElement>('option[value="all"]');
    if (all) all.disabled = preview.candidate.completeness === 'partial';
    if (preview.candidate.completeness === 'partial' && mode.value === 'all') mode.value = 'blocks';

    if (mode.value === 'all') {
      choices.append(node('p', '将候选整稿替换当前Draft。'));
    } else if (mode.value === 'blocks') {
      for (const [index, block] of preview.candidate.blocks.entries()) {
        const item = node('label');
        const input = node('input');
        input.type = 'checkbox';
        input.name = 'candidate-block-choice';
        input.value = block.candidateBlockId;
        input.checked = true;
        item.append(
          input,
          document.createTextNode(` 块 ${index + 1} · ${block.text.slice(0, 60)}`),
        );
        choices.append(item);
      }
    } else {
      const beats = [
        ...new Set(
          preview.candidate.blocks.flatMap((block) => (block.beatId ? [block.beatId] : [])),
        ),
      ];
      for (const beatId of beats) {
        const item = node('label');
        const input = node('input');
        input.type = 'checkbox';
        input.name = 'candidate-beat-choice';
        input.value = beatId;
        input.checked = true;
        item.append(input, document.createTextNode(` ${beatId}`));
        choices.append(item);
      }
      if (!beats.length) choices.append(node('p', '当前候选没有SceneBeat标记。'));
    }
    submit.disabled = preview.candidate.status !== 'pending' || buildSelection() === null;
    undo.hidden = undoPreview === null;
    undo.disabled = !undoPreview?.canUndo;
  };

  const loadUndoPreview = async (
    context: CandidateContext,
    candidateId: string,
  ): Promise<CandidateUndoPreview | null> => {
    const lookup = await safely(() =>
      window.worldforgeCandidatePreview.findUndoRecord({
        ...context,
        candidateId,
      }),
    );
    if (!lookup?.ok) return null;
    const result = await safely(() =>
      window.worldforgeCandidatePreview.previewUndo({
        ...context,
        applyRecordId: lookup.data.applyRecordId,
      }),
    );
    return result?.ok ? result.data : null;
  };

  const acceptPreview = async (nextPreview: CandidatePreview): Promise<void> => {
    const request = ++refreshId;
    const context = await options.context();
    const candidateId = candidateSelect.value;
    if (!context || !candidateId || nextPreview.candidate.candidateId !== candidateId) return;
    const nextUndoPreview =
      nextPreview.candidate.status === 'accepted'
        ? await loadUndoPreview(context, nextPreview.candidate.candidateId)
        : null;
    if (request !== refreshId || candidateSelect.value !== nextPreview.candidate.candidateId) {
      return;
    }
    preview = nextPreview;
    undoPreview = nextUndoPreview;
    if (undoPreview) {
      status.textContent = undoPreview.canUndo
        ? '该候选已应用，可整体撤销。'
        : '该应用已撤销或当前稿已变化，不会静默回退。';
      renderConflicts(undoPreview.conflictSet?.conflicts ?? []);
    } else {
      conflicts.replaceChildren();
      status.textContent =
        preview.candidate.status !== 'pending'
          ? `候选状态为 ${preview.candidate.status}，不可再次采用。`
          : preview.candidate.completeness === 'partial'
            ? '不完整建议稿仅允许按块或SceneBeat采用。'
            : '已准备采用。';
    }
    render();
  };

  const handlePreviewLoading = (): void => {
    refreshId += 1;
    preview = null;
    undoPreview = null;
    conflicts.replaceChildren();
    status.textContent = '正在准备候选采用选项…';
    render();
  };

  const handlePreviewReady = (event: Event): void => {
    const nextPreview = (event as CustomEvent<CandidatePreview>).detail;
    void acceptPreview(nextPreview);
  };

  const submitSelection = async (): Promise<void> => {
    const context = await options.context();
    const selection = buildSelection();
    if (!context || !preview || !selection) return;
    const request = ++refreshId;
    const activePreview = preview;
    const candidateId = activePreview.candidate.candidateId;
    submit.disabled = true;
    conflicts.replaceChildren();
    const result = await safely(() =>
      window.worldforgeCandidatePreview.apply({
        ...context,
        candidateId,
        draftId: activePreview.draft.draftId,
        baseRevision: activePreview.draft.revision,
        selection,
      }),
    );
    if (request !== refreshId || candidateSelect.value !== candidateId) return;
    if (!result) {
      status.textContent = '采用失败 · COMMON_INTERNAL_999';
      submit.disabled = false;
      return;
    }
    if (!result.ok) {
      status.textContent = `采用失败 · ${result.error.code}`;
      submit.disabled = false;
      return;
    }
    if (result.data.outcome === 'conflict') {
      status.textContent = `发现${result.data.conflictSet.conflicts.length}项冲突，Draft未改变。`;
      renderConflicts(result.data.conflictSet.conflicts);
      submit.disabled = false;
      return;
    }
    const applied = result.data;
    const undoResult = await safely(() =>
      window.worldforgeCandidatePreview.previewUndo({
        ...context,
        applyRecordId: applied.record.applyRecordId,
      }),
    );
    if (request !== refreshId || candidateSelect.value !== candidateId) return;
    preview = {
      ...activePreview,
      candidate: {
        ...activePreview.candidate,
        status: 'accepted',
        resolvedAt: applied.record.appliedAt,
      },
      draft: applied.draft,
    };
    undoPreview = undoResult?.ok ? undoResult.data : null;
    status.textContent = `采用成功 · Revision ${applied.draft.revision}`;
    const current = document.querySelector<HTMLElement>('[data-candidate-preview-current]');
    if (current) current.textContent = applied.draft.blocks.map((block) => block.text).join('\n\n');
    const option = candidateSelect.selectedOptions[0];
    if (option) option.textContent = `${preview.candidate.title} · accepted`;
    render();
  };

  const undoApplication = async (): Promise<void> => {
    const context = await options.context();
    if (!context || !undoPreview) return;
    const request = ++refreshId;
    const candidateId = candidateSelect.value;
    const activeUndoPreview = undoPreview;
    undo.disabled = true;
    const fresh = await safely(() =>
      window.worldforgeCandidatePreview.previewUndo({
        ...context,
        applyRecordId: activeUndoPreview.record.applyRecordId,
      }),
    );
    if (request !== refreshId || candidateSelect.value !== candidateId) return;
    if (!fresh) {
      status.textContent = '撤销预览失败 · COMMON_INTERNAL_999';
      undo.disabled = false;
      return;
    }
    if (!fresh.ok) {
      status.textContent = `撤销预览失败 · ${fresh.error.code}`;
      undo.disabled = false;
      return;
    }
    undoPreview = fresh.data;
    if (!fresh.data.canUndo) {
      status.textContent = '当前稿已变化，撤销进入冲突且未修改Draft。';
      renderConflicts(fresh.data.conflictSet?.conflicts ?? []);
      render();
      return;
    }
    const result = await safely(() =>
      window.worldforgeCandidatePreview.undo({
        ...context,
        applyRecordId: fresh.data.record.applyRecordId,
        draftId: fresh.data.currentDraft.draftId,
        baseRevision: fresh.data.currentDraft.revision,
      }),
    );
    if (request !== refreshId || candidateSelect.value !== candidateId) return;
    if (!result) {
      status.textContent = '撤销失败 · COMMON_INTERNAL_999';
      undo.disabled = false;
      return;
    }
    if (!result.ok) {
      status.textContent = `撤销失败 · ${result.error.code}`;
      undo.disabled = false;
      return;
    }
    if (result.data.outcome === 'conflict') {
      status.textContent = '撤销冲突，Draft未改变。';
      renderConflicts(result.data.conflictSet.conflicts);
      undo.disabled = false;
      return;
    }
    status.textContent = `已撤销本次应用 · Revision ${result.data.draft.revision}`;
    const current = document.querySelector<HTMLElement>('[data-candidate-preview-current]');
    if (current)
      current.textContent = result.data.draft.blocks.map((block) => block.text).join('\n\n');
    undoPreview = null;
    undo.hidden = true;
    undo.disabled = true;
  };

  mode.addEventListener('change', render);
  choices.addEventListener('change', () => {
    submit.disabled = preview?.candidate.status !== 'pending' || buildSelection() === null;
  });
  submit.addEventListener('click', () => void submitSelection());
  undo.addEventListener('click', () => void undoApplication());
  dialog.addEventListener('worldforge:candidate-preview-loading', handlePreviewLoading);
  dialog.addEventListener('worldforge:candidate-preview-ready', handlePreviewReady);

  return () => {
    dialog.removeEventListener('worldforge:candidate-preview-loading', handlePreviewLoading);
    dialog.removeEventListener('worldforge:candidate-preview-ready', handlePreviewReady);
    panel.remove();
  };
}
