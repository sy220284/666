import type { CandidatePreview, CandidateSelection } from '@worldforge/contracts';

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
  panel.append(node('h3', '采用候选内容'), label, submit, status, choices, conflicts);
  dialog.append(panel);

  let preview: CandidatePreview | null = null;
  let refreshId = 0;

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
    conflicts.replaceChildren();
    if (!preview) {
      submit.disabled = true;
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
    submit.disabled = buildSelection() === null;
  };

  const refresh = async (): Promise<void> => {
    const request = ++refreshId;
    const context = await options.context();
    const candidateId = candidateSelect.value;
    if (!context || !candidateId) return;
    const result = await window.worldforgeCandidatePreview.preview({ ...context, candidateId });
    if (request !== refreshId) return;
    if (!result.ok) {
      preview = null;
      status.textContent = `准备失败 · ${result.error.code}`;
      render();
      return;
    }
    preview = result.data;
    status.textContent =
      preview.candidate.completeness === 'partial'
        ? '不完整建议稿仅允许按块或SceneBeat采用。'
        : '已准备采用。';
    render();
  };

  const submitSelection = async (): Promise<void> => {
    const context = await options.context();
    const selection = buildSelection();
    if (!context || !preview || !selection) return;
    submit.disabled = true;
    conflicts.replaceChildren();
    const result = await window.worldforgeCandidatePreview.apply({
      ...context,
      candidateId: preview.candidate.candidateId,
      draftId: preview.draft.draftId,
      baseRevision: preview.draft.revision,
      selection,
    });
    if (!result.ok) {
      status.textContent = `采用失败 · ${result.error.code}`;
      submit.disabled = false;
      return;
    }
    if (result.data.outcome === 'conflict') {
      status.textContent = `发现${result.data.conflictSet.conflicts.length}项冲突，Draft未改变。`;
      for (const conflict of result.data.conflictSet.conflicts) {
        conflicts.append(node('li', `${conflict.kind} · ${conflict.message}`));
      }
      submit.disabled = false;
      return;
    }
    status.textContent = `采用成功 · Revision ${result.data.draft.revision}`;
    const current = document.querySelector<HTMLElement>('[data-candidate-preview-current]');
    if (current)
      current.textContent = result.data.draft.blocks.map((block) => block.text).join('\n\n');
    const option = candidateSelect.selectedOptions[0];
    if (option) option.textContent = `${preview.candidate.title} · accepted`;
  };

  mode.addEventListener('change', render);
  choices.addEventListener('change', () => {
    submit.disabled = buildSelection() === null;
  });
  submit.addEventListener('click', () => void submitSelection());
  candidateSelect.addEventListener('change', () => void refresh());
  const observer = new MutationObserver(() => void refresh());
  observer.observe(candidateSelect, { childList: true });

  return () => {
    observer.disconnect();
    panel.remove();
  };
}
