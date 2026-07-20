import type { ContinuityCatalog } from '@worldforge/contracts';

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  text?: string,
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function identifier(id: string): HTMLElement {
  const wrapper = element('span');
  const code = element('code', id);
  const copy = element('button', '复制ID');
  copy.type = 'button';
  copy.addEventListener('click', () => void navigator.clipboard.writeText(id));
  wrapper.append(code, ' ', copy);
  return wrapper;
}

function record(title: string, id: string, lines: readonly string[]): HTMLLIElement {
  const item = element('li');
  item.append(element('strong', title), ' ', identifier(id));
  const details = element('ul');
  for (const line of lines) details.append(element('li', line));
  item.append(details);
  return item;
}

function section(title: string, items: readonly HTMLLIElement[]): HTMLElement {
  const wrapper = element('section');
  wrapper.append(element('h3', `${title}（${items.length}）`));
  const list = element('ul');
  for (const item of items) list.append(item);
  if (items.length === 0) list.append(element('li', '无匹配记录'));
  wrapper.append(list);
  return wrapper;
}

function renderCatalog(host: HTMLElement, catalog: ContinuityCatalog): void {
  host.replaceChildren(
    section(
      '动态状态',
      catalog.entityStates.map((state) =>
        record(state.stateKey, state.id, [
          `Entity: ${state.entityId}`,
          `值: ${JSON.stringify(state.value)}`,
          `章节区间: [${state.validFromChapterId}, ${state.validUntilChapterId ?? '∞'})`,
          `记录状态: ${state.recordStatus}`,
          `来源Version: ${state.sourceVersionId}`,
          `证据: ${state.evidence.map((anchor) => `${anchor.kind}:${anchor.targetId}`).join(', ') || '无'}`,
        ]),
      ),
    ),
    section(
      '时间线事件',
      catalog.timelineEvents.map((event) =>
        record(event.title, event.id, [
          `时间: ${event.startValue}${event.endValue ? ` — ${event.endValue}` : ''}`,
          `精度: ${event.precision}`,
          `章节: ${event.chapterId ?? '未绑定'}`,
          `地点: ${event.locationId ?? '未绑定'}`,
          `参与者: ${event.participantIds.join(', ') || '无'}`,
          `前置事件: ${event.dependencyIds.join(', ') || '无'}`,
          `状态: ${event.status}`,
        ]),
      ),
    ),
    section(
      '知情状态',
      catalog.knowledgeStates.map((state) =>
        record(state.informationKey, state.id, [
          `Character: ${state.characterId}`,
          `认知: ${state.knowledgeStatus}`,
          `章节区间: [${state.validFromChapterId}, ${state.validUntilChapterId ?? '∞'})`,
          `记录状态: ${state.recordStatus}`,
          `来源Version: ${state.sourceVersionId ?? '无'}`,
          `来源逻辑块: ${state.sourceLogicalBlockId ?? '无'}`,
          `备注: ${state.notes || '无'}`,
        ]),
      ),
    ),
  );
}

function mount(): void {
  const actions = document.querySelector<HTMLElement>('.active-project__actions');
  if (
    !window.worldforgeContinuity ||
    document.querySelector('[data-continuity-dialog]') ||
    !actions
  ) {
    return;
  }
  const openButton = element('button', '连续性账本');
  openButton.type = 'button';
  openButton.className = 'quiet-button';
  openButton.dataset.openContinuity = '';

  const dialog = element('dialog');
  dialog.dataset.continuityDialog = '';
  const title = element('h2', '动态状态、时间线与知情信息');
  const status = element('p', '尚未读取');
  status.dataset.continuityStatus = '';
  const query = element('input');
  query.type = 'search';
  query.placeholder = '搜索状态键、事件、信息键';
  query.setAttribute('aria-label', '搜索连续性记录');
  const effectiveChapter = element('input');
  effectiveChapter.type = 'text';
  effectiveChapter.placeholder = '可选：生效章节UUID';
  effectiveChapter.setAttribute('aria-label', '生效章节ID');
  const historyLabel = element('label');
  const history = element('input');
  history.type = 'checkbox';
  history.checked = true;
  historyLabel.append(history, ' 包含历史记录');
  const archivedLabel = element('label');
  const archived = element('input');
  archived.type = 'checkbox';
  archivedLabel.append(archived, ' 包含已归档事件');
  const refresh = element('button', '读取');
  refresh.type = 'button';
  const close = element('button', '关闭');
  close.type = 'button';
  const results = element('div');
  results.dataset.continuityResults = '';

  const load = async (): Promise<void> => {
    status.textContent = '读取中…';
    const active = await window.worldforge.project.getActive();
    if (!active.ok || !active.data) {
      status.textContent = '请先打开项目。';
      results.replaceChildren();
      return;
    }
    const response = await window.worldforgeContinuity.list({
      projectId: active.data.projectId,
      query: query.value,
      includeHistory: history.checked,
      includeArchivedEvents: archived.checked,
      effectiveAtChapterId: effectiveChapter.value.trim() || null,
    });
    if (!response.ok) {
      status.textContent = `读取失败：${response.error.code}`;
      results.replaceChildren();
      return;
    }
    status.textContent = `项目：${active.data.name}`;
    renderCatalog(results, response.data);
  };

  openButton.addEventListener('click', () => {
    dialog.showModal();
    void load();
  });
  refresh.addEventListener('click', () => void load());
  query.addEventListener('input', () => void load());
  close.addEventListener('click', () => dialog.close());
  dialog.append(
    title,
    status,
    query,
    effectiveChapter,
    historyLabel,
    archivedLabel,
    refresh,
    close,
    results,
  );
  actions.append(openButton);
  document.body.append(dialog);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
