interface CandidatePreviewContext {
  readonly projectId: string;
  readonly chapterId: string;
}

interface CandidatePreviewUiOptions {
  readonly context: () => Promise<CandidatePreviewContext | null>;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function blocksText(blocks: readonly { readonly text: string }[]): string {
  return blocks.map((block) => block.text).join('\n\n');
}

export function setupCandidatePreviewUi(options: CandidatePreviewUiOptions): () => void {
  const button = element('button', '候选预览');
  button.type = 'button';
  button.className = 'quiet-button';
  button.dataset.openCandidatePreview = '';
  const anchor = document.querySelector<HTMLElement>('[data-open-versions]');
  anchor?.parentElement?.insertBefore(button, anchor);

  const dialog = element('dialog');
  dialog.dataset.candidatePreviewDialog = '';
  dialog.style.width = 'min(1040px, calc(100vw - 32px))';
  dialog.style.maxHeight = 'calc(100vh - 32px)';
  dialog.style.padding = '20px';

  const heading = element('h2', 'Fixture Candidate 差异预览');
  const controls = element('div');
  controls.style.display = 'flex';
  controls.style.gap = '12px';
  controls.style.alignItems = 'center';
  const select = element('select');
  select.dataset.candidatePreviewSelect = '';
  select.setAttribute('aria-label', '选择候选稿');
  const close = element('button', '关闭');
  close.type = 'button';
  const status = element('p', '选择候选后读取已保存正文的差异。');
  status.dataset.candidatePreviewStatus = '';
  status.setAttribute('role', 'status');
  const warning = element('p');
  warning.dataset.candidatePreviewWarning = '';
  warning.setAttribute('role', 'status');
  controls.append(select, close);

  const summary = element('pre');
  summary.dataset.candidatePreviewSummary = '';
  summary.style.whiteSpace = 'pre-wrap';
  const columns = element('div');
  columns.style.display = 'grid';
  columns.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
  columns.style.gap = '16px';
  const currentPanel = element('section');
  const candidatePanel = element('section');
  const currentHeading = element('h3', '当前已保存稿');
  const candidateHeading = element('h3', '候选稿');
  const currentText = element('pre');
  const candidateText = element('pre');
  currentText.dataset.candidatePreviewCurrent = '';
  candidateText.dataset.candidatePreviewCandidate = '';
  for (const panel of [currentText, candidateText]) {
    panel.style.whiteSpace = 'pre-wrap';
    panel.style.maxHeight = '48vh';
    panel.style.overflow = 'auto';
    panel.style.padding = '12px';
    panel.style.border = '1px solid currentColor';
  }
  currentPanel.append(currentHeading, currentText);
  candidatePanel.append(candidateHeading, candidateText);
  columns.append(currentPanel, candidatePanel);
  dialog.append(heading, controls, status, warning, summary, columns);
  document.body.append(dialog);

  const loadPreview = async (): Promise<void> => {
    const context = await options.context();
    const candidateId = select.value;
    if (!context || !candidateId) return;
    select.disabled = true;
    status.textContent = '正在计算结构与中文字符差异…';
    try {
      const result = await window.worldforgeCandidatePreview.preview({ ...context, candidateId });
      if (!result.ok) {
        status.textContent = `预览失败 · ${result.error.code}`;
        return;
      }
      const preview = result.data;
      const counts = new Map<string, number>();
      for (const entry of preview.structure) {
        counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
      }
      status.textContent = `基础 Revision ${preview.candidate.baseDraftRevision} · ${preview.execution.strategy}`;
      warning.textContent =
        preview.candidate.completeness === 'partial'
          ? '不完整建议稿：只允许阅读和后续局部采用，不能整稿定稿。'
          : '';
      summary.textContent = [
        `结构差异：${[...counts.entries()].map(([kind, count]) => `${kind} ${count}`).join(' · ') || '无'}`,
        `字符差异块：${preview.characterDiffs.length}`,
        `章节字符：${preview.execution.chapterCharacters}`,
      ].join('\n');
      currentText.textContent = blocksText(preview.draft.blocks);
      candidateText.textContent = blocksText(preview.candidate.blocks);
    } catch {
      status.textContent = '预览失败 · COMMON_INTERNAL_999';
    } finally {
      select.disabled = false;
    }
  };

  const open = async (): Promise<void> => {
    const context = await options.context();
    if (!context) {
      window.alert('请先打开一个章节。');
      return;
    }
    status.textContent = '正在读取候选列表…';
    warning.textContent = '预览只读取已持久化Draft，不会写入项目数据库。';
    summary.textContent = '';
    currentText.textContent = '';
    candidateText.textContent = '';
    dialog.showModal();
    try {
      const result = await window.worldforge.candidate.list(context.projectId, context.chapterId);
      select.replaceChildren();
      if (!result.ok) {
        status.textContent = `候选列表读取失败 · ${result.error.code}`;
        return;
      }
      for (const candidate of result.data.candidates) {
        const option = element('option', `${candidate.title} · ${candidate.status}`);
        option.value = candidate.candidateId;
        select.append(option);
      }
      if (select.options.length === 0) {
        status.textContent = '当前章节没有 Fixture Candidate。';
        return;
      }
      await loadPreview();
    } catch {
      status.textContent = '候选列表读取失败 · COMMON_INTERNAL_999';
    }
  };

  button.addEventListener('click', () => void open());
  select.addEventListener('change', () => void loadPreview());
  close.addEventListener('click', () => dialog.close());

  return () => {
    button.remove();
    dialog.remove();
  };
}
