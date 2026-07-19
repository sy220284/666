import type {
  ContinuityCatalog,
  Entity,
  EntityCatalog,
  KnowledgeStatus,
  ProjectStructure,
  ProjectWorkspaceSummary,
  TimelineEvent,
  TimelinePrecision,
} from '@worldforge/contracts';

const dialog = document.querySelector<HTMLDialogElement>('[data-continuity-dialog]');
const openButton = document.querySelector<HTMLButtonElement>('[data-open-continuity]');
const closeButton = document.querySelector<HTMLButtonElement>('[data-close-continuity]');
const refreshButton = document.querySelector<HTMLButtonElement>('[data-refresh-continuity]');
const searchInput = document.querySelector<HTMLInputElement>('[data-continuity-search]');
const includeHistoryInput = document.querySelector<HTMLInputElement>(
  '[data-continuity-include-history]',
);
const effectiveChapterSelect = document.querySelector<HTMLSelectElement>(
  '[data-continuity-effective-chapter]',
);
const status = document.querySelector<HTMLElement>('[data-continuity-status]');
const stateForm = document.querySelector<HTMLFormElement>('[data-entity-state-form]');
const timelineForm = document.querySelector<HTMLFormElement>('[data-timeline-event-form]');
const knowledgeForm = document.querySelector<HTMLFormElement>('[data-knowledge-state-form]');
const stateList = document.querySelector<HTMLElement>('[data-entity-state-list]');
const timelineList = document.querySelector<HTMLElement>('[data-timeline-event-list]');
const knowledgeList = document.querySelector<HTMLElement>('[data-knowledge-state-list]');
const timelineEventSelect = document.querySelector<HTMLSelectElement>(
  '[data-timeline-event-select]',
);
const newTimelineButton = document.querySelector<HTMLButtonElement>('[data-new-timeline-event]');

let project: ProjectWorkspaceSummary | null = null;
let entityCatalog: EntityCatalog | null = null;
let structure: ProjectStructure | null = null;
let catalog: ContinuityCatalog | null = null;
let selectedTimelineEventId: string | null = null;

function setStatus(message: string, error = false): void {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

function controls(
  form: HTMLFormElement | null,
): Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement> {
  if (!form) return [];
  return [...form.elements].filter(
    (
      element,
    ): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement =>
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLButtonElement,
  );
}

function setWriteDisabled(disabled: boolean): void {
  for (const form of [stateForm, timelineForm, knowledgeForm]) {
    for (const element of controls(form)) element.disabled = disabled;
  }
  if (newTimelineButton) newTimelineButton.disabled = disabled;
}

function field(
  form: HTMLFormElement | null,
  name: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const element = form?.elements.namedItem(name);
  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
    ? element
    : null;
}

function entityOptions(
  select: HTMLSelectElement | null,
  predicate: (entity: Entity) => boolean,
  allowEmpty = true,
): void {
  if (!select) return;
  const previous = select.value;
  select.replaceChildren();
  if (allowEmpty) select.append(new Option('—', ''));
  for (const entity of entityCatalog?.entities.filter(predicate) ?? []) {
    select.append(new Option(`${entity.name} · ${entity.id.slice(0, 8)}`, entity.id));
  }
  select.value = [...select.options].some((option) => option.value === previous) ? previous : '';
}

function fillReferenceOptions(): void {
  for (const select of dialog?.querySelectorAll<HTMLSelectElement>('[data-continuity-entity]') ?? []) {
    entityOptions(select, (entity) => entity.status === 'active', false);
  }
  for (const select of dialog?.querySelectorAll<HTMLSelectElement>('[data-continuity-character]') ?? []) {
    entityOptions(
      select,
      (entity) => entity.status === 'active' && entity.entityType === 'character',
      false,
    );
  }
  for (const select of dialog?.querySelectorAll<HTMLSelectElement>('[data-continuity-location]') ?? []) {
    entityOptions(
      select,
      (entity) => entity.status === 'active' && entity.entityType === 'location',
      true,
    );
  }
  const chapters =
    structure?.volumes.flatMap((volume) =>
      volume.chapters.map((chapter) => ({
        id: chapter.id,
        label: `${volume.title} / ${chapter.title}`,
      })),
    ) ?? [];
  for (const select of dialog?.querySelectorAll<HTMLSelectElement>('[data-continuity-chapter]') ?? []) {
    const previous = select.value;
    const nullable = select.dataset.continuityChapter === 'nullable';
    select.replaceChildren();
    if (nullable) select.append(new Option('—', ''));
    for (const chapter of chapters) select.append(new Option(chapter.label, chapter.id));
    select.value = [...select.options].some((option) => option.value === previous) ? previous : '';
  }
}

function referenceButton(value: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quiet-button continuity-copy';
  button.textContent = '复制引用';
  button.addEventListener('click', () => {
    void navigator.clipboard.writeText(value).then(
      () => setStatus(`已复制引用：${value}`),
      () => setStatus('复制失败，请手动选择ID。', true),
    );
  });
  return button;
}

function recordCard(
  title: string,
  badgeText: string,
  id: string,
  body: string,
  metadata: string,
): HTMLElement {
  const article = document.createElement('article');
  article.className = 'continuity-record';
  const header = document.createElement('header');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const badge = document.createElement('span');
  badge.className = 'prototype-badge';
  badge.textContent = badgeText;
  header.append(heading, badge, referenceButton(id));
  const pre = document.createElement('pre');
  pre.textContent = body;
  const small = document.createElement('small');
  small.textContent = `${id} · ${metadata}`;
  article.append(header, pre, small);
  return article;
}

function renderStates(next: ContinuityCatalog): void {
  if (!stateList) return;
  stateList.replaceChildren();
  if (next.entityStates.length === 0) {
    stateList.textContent = '没有匹配的动态状态。';
    return;
  }
  for (const state of next.entityStates) {
    const entityName =
      entityCatalog?.entities.find((entity) => entity.id === state.entityId)?.name ?? state.entityId;
    stateList.append(
      recordCard(
        `${entityName} · ${state.stateKey}`,
        state.recordStatus.toUpperCase(),
        state.id,
        JSON.stringify(state.value, null, 2),
        `${state.validFromChapterId} → ${state.validUntilChapterId ?? '持续'} · source ${state.sourceVersionId}`,
      ),
    );
  }
}

function renderTimeline(next: ContinuityCatalog): void {
  if (!timelineList || !timelineEventSelect) return;
  timelineList.replaceChildren();
  const previous = selectedTimelineEventId;
  timelineEventSelect.replaceChildren(new Option('新建事件', ''));
  for (const event of next.timelineEvents) {
    timelineEventSelect.append(new Option(`${event.title} · ${event.startValue}`, event.id));
    timelineList.append(
      recordCard(
        event.title,
        event.precision.toUpperCase(),
        event.id,
        `${event.startValue}${event.endValue ? ` → ${event.endValue}` : ''}\n参与者：${event.participantIds.join(', ') || '无'}\n依赖：${event.dependencyIds.join(', ') || '无'}`,
        `chapter ${event.chapterId ?? '—'} · location ${event.locationId ?? '—'}`,
      ),
    );
  }
  selectedTimelineEventId = next.timelineEvents.some((event) => event.id === previous)
    ? previous
    : null;
  timelineEventSelect.value = selectedTimelineEventId ?? '';
  populateTimelineForm(selectedTimelineEvent());
  if (next.timelineEvents.length === 0) timelineList.textContent = '没有匹配的时间线事件。';
}

function renderKnowledge(next: ContinuityCatalog): void {
  if (!knowledgeList) return;
  knowledgeList.replaceChildren();
  if (next.knowledgeStates.length === 0) {
    knowledgeList.textContent = '没有匹配的知情记录。';
    return;
  }
  for (const knowledge of next.knowledgeStates) {
    const characterName =
      entityCatalog?.entities.find((entity) => entity.id === knowledge.characterId)?.name ??
      knowledge.characterId;
    knowledgeList.append(
      recordCard(
        `${characterName} · ${knowledge.informationKey}`,
        `${knowledge.knowledgeStatus} / ${knowledge.recordStatus}`,
        knowledge.id,
        knowledge.notes || '无补充说明',
        `chapter ${knowledge.acquiredChapterId ?? '—'} · version ${knowledge.sourceVersionId ?? '—'} · block ${knowledge.sourceBlockId ?? '—'}`,
      ),
    );
  }
}

function render(next: ContinuityCatalog): void {
  catalog = next;
  renderStates(next);
  renderTimeline(next);
  renderKnowledge(next);
}

function selectedTimelineEvent(): TimelineEvent | null {
  return catalog?.timelineEvents.find((event) => event.id === selectedTimelineEventId) ?? null;
}

function lineIds(value: FormDataEntryValue | null): string[] {
  return [
    ...new Set(
      String(value ?? '')
        .split(/\r?\n|,/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function nullable(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function populateTimelineForm(event: TimelineEvent | null): void {
  if (!timelineForm) return;
  timelineForm.reset();
  const values: Record<string, string> = {
    title: event?.title ?? '',
    startValue: event?.startValue ?? '',
    endValue: event?.endValue ?? '',
    precision: event?.precision ?? 'exact',
    chapterId: event?.chapterId ?? '',
    locationId: event?.locationId ?? '',
    description: event?.description ?? '',
    participantIds: event?.participantIds.join('\n') ?? '',
    dependencyIds: event?.dependencyIds.join('\n') ?? '',
  };
  for (const [name, value] of Object.entries(values)) {
    const control = field(timelineForm, name);
    if (control) control.value = value;
  }
}

async function resolveContext(): Promise<boolean> {
  const active = await window.worldforge.project.getActive();
  if (!active.ok || !active.data) {
    setStatus('请先打开项目。', true);
    return false;
  }
  project = active.data;
  const [entities, projectStructure] = await Promise.all([
    window.worldforge.canon.list({
      projectId: project.projectId,
      includeArchived: true,
    }),
    window.worldforge.planning.listStructure(project.projectId),
  ]);
  if (!entities.ok || !projectStructure.ok) {
    setStatus('读取实体或卷章引用失败。', true);
    return false;
  }
  entityCatalog = entities.data;
  structure = projectStructure.data;
  fillReferenceOptions();
  setWriteDisabled(project.databaseMode !== 'read-write');
  return true;
}

async function refresh(message = '正在读取连续性账本…'): Promise<void> {
  if (!(await resolveContext()) || !project) return;
  setStatus(message);
  const result = await window.worldforge.continuity.list({
    projectId: project.projectId,
    query: searchInput?.value.trim() ?? '',
    includeHistory: includeHistoryInput?.checked ?? true,
    effectiveAtChapterId: effectiveChapterSelect?.value || null,
  });
  if (!result.ok) {
    setStatus(`读取失败 · ${result.error.code}`, true);
    return;
  }
  render(result.data);
  setStatus(
    project.databaseMode === 'read-write'
      ? `状态 ${result.data.entityStates.length} · 事件 ${result.data.timelineEvents.length} · 知情 ${result.data.knowledgeStates.length}`
      : '当前项目只读；连续性账本仅可查看。',
  );
}

openButton?.addEventListener('click', () => {
  dialog?.showModal();
  void refresh();
});
closeButton?.addEventListener('click', () => dialog?.close());
refreshButton?.addEventListener('click', () => void refresh());
searchInput?.addEventListener('input', () => void refresh('正在搜索连续性记录…'));
includeHistoryInput?.addEventListener('change', () => void refresh());
effectiveChapterSelect?.addEventListener('change', () => void refresh());
newTimelineButton?.addEventListener('click', () => {
  selectedTimelineEventId = null;
  if (timelineEventSelect) timelineEventSelect.value = '';
  populateTimelineForm(null);
});
timelineEventSelect?.addEventListener('change', () => {
  selectedTimelineEventId = timelineEventSelect.value || null;
  populateTimelineForm(selectedTimelineEvent());
});

stateForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    if (!project || project.databaseMode !== 'read-write' || !stateForm) return;
    const data = new FormData(stateForm);
    let value: unknown;
    let evidence: unknown;
    try {
      value = JSON.parse(String(data.get('valueJson') ?? ''));
      evidence = JSON.parse(String(data.get('evidenceJson') ?? '[]'));
    } catch {
      return setStatus('状态值和证据必须是有效JSON。', true);
    }
    setStatus('正在确认动态状态；旧current将保留为历史。');
    const result = await window.worldforge.continuity.setEntityState({
      projectId: project.projectId,
      authority: 'author',
      entityId: String(data.get('entityId') ?? ''),
      stateKey: String(data.get('stateKey') ?? ''),
      value: value as never,
      validFromChapterId: String(data.get('validFromChapterId') ?? ''),
      validUntilChapterId: nullable(data.get('validUntilChapterId')),
      evidence: evidence as never,
      sourceVersionId: String(data.get('sourceVersionId') ?? ''),
    });
    if (!result.ok) return setStatus(`状态保存失败 · ${result.error.code}`, true);
    render(result.data);
    setStatus('动态状态已确认，并保留章节生效历史。');
  })();
});

timelineForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    if (!project || project.databaseMode !== 'read-write' || !timelineForm) return;
    const data = new FormData(timelineForm);
    setStatus('正在校验时间、地点和依赖图…');
    const result = await window.worldforge.continuity.saveTimelineEvent({
      projectId: project.projectId,
      authority: 'author',
      eventId: selectedTimelineEventId,
      title: String(data.get('title') ?? ''),
      startValue: String(data.get('startValue') ?? ''),
      endValue: nullable(data.get('endValue')),
      precision: String(data.get('precision') ?? 'exact') as TimelinePrecision,
      chapterId: nullable(data.get('chapterId')),
      locationId: nullable(data.get('locationId')),
      description: String(data.get('description') ?? ''),
      participantIds: lineIds(data.get('participantIds')),
      dependencyIds: lineIds(data.get('dependencyIds')),
    });
    if (!result.ok) return setStatus(`时间线保存失败 · ${result.error.code}`, true);
    render(result.data);
    const saved = result.data.timelineEvents.find(
      (item) => item.title === String(data.get('title') ?? '').trim(),
    );
    selectedTimelineEventId = saved?.id ?? selectedTimelineEventId;
    if (timelineEventSelect) timelineEventSelect.value = selectedTimelineEventId ?? '';
    setStatus('时间线事件已保存；冲突与依赖规则已通过。');
  })();
});

knowledgeForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    if (!project || project.databaseMode !== 'read-write' || !knowledgeForm) return;
    const data = new FormData(knowledgeForm);
    setStatus('正在确认人物知情边界…');
    const result = await window.worldforge.continuity.setKnowledgeState({
      projectId: project.projectId,
      authority: 'author',
      informationKey: String(data.get('informationKey') ?? ''),
      characterId: String(data.get('characterId') ?? ''),
      knowledgeStatus: String(data.get('knowledgeStatus') ?? 'unknown') as KnowledgeStatus,
      acquiredChapterId: nullable(data.get('acquiredChapterId')),
      sourceBlockId: nullable(data.get('sourceBlockId')),
      sourceVersionId: nullable(data.get('sourceVersionId')),
      notes: String(data.get('notes') ?? ''),
    });
    if (!result.ok) return setStatus(`知情状态保存失败 · ${result.error.code}`, true);
    render(result.data);
    setStatus('知情状态已确认；上一状态保留为历史。');
  })();
});
