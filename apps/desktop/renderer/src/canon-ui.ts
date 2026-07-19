import type { Entity, EntityCatalog, EntityType, ProjectWorkspaceSummary } from '@worldforge/contracts';

const dialog = document.querySelector<HTMLDialogElement>('[data-canon-dialog]');
const openButton = document.querySelector<HTMLButtonElement>('[data-open-canon]');
const closeButton = document.querySelector<HTMLButtonElement>('[data-close-canon]');
const newButton = document.querySelector<HTMLButtonElement>('[data-new-entity]');
const archiveButton = document.querySelector<HTMLButtonElement>('[data-archive-entity]');
const deleteButton = document.querySelector<HTMLButtonElement>('[data-delete-entity]');
const refreshButton = document.querySelector<HTMLButtonElement>('[data-refresh-canon]');
const entitySelect = document.querySelector<HTMLSelectElement>('[data-canon-entity-select]');
const entityForm = document.querySelector<HTMLFormElement>('[data-canon-entity-form]');
const factForm = document.querySelector<HTMLFormElement>('[data-canon-fact-form]');
const factList = document.querySelector<HTMLElement>('[data-canon-fact-list]');
const status = document.querySelector<HTMLElement>('[data-canon-status]');
const entityMode = document.querySelector<HTMLElement>('[data-canon-entity-mode]');

let project: ProjectWorkspaceSummary | null = null;
let catalog: EntityCatalog | null = null;
let selectedEntityId: string | null = null;

const entityTypeLabels: Record<EntityType, string> = {
  character: '人物',
  location: '地点',
  faction: '势力',
  item: '道具',
  ability: '能力',
  rule: '规则',
  event: '事件',
  custom: '自定义',
};

function setStatus(message: string, error = false): void {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

function selectedEntity(): Entity | null {
  return catalog?.entities.find((entity) => entity.id === selectedEntityId) ?? null;
}

function setWriteDisabled(disabled: boolean): void {
  for (const element of dialog?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>(
    '[data-canon-write]',
  ) ?? []) {
    element.disabled = disabled;
  }
}

function formControl(name: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const control = entityForm?.elements.namedItem(name);
  return control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement
    ? control
    : null;
}

function populateEntityForm(entity: Entity | null): void {
  if (!entityForm) return;
  entityForm.reset();
  const type = formControl('entityType');
  const name = formControl('name');
  const aliases = formControl('aliases');
  const summary = formControl('summary');
  if (type) type.value = entity?.entityType ?? 'character';
  if (name) name.value = entity?.name ?? '';
  if (aliases) aliases.value = entity?.aliases.join('\n') ?? '';
  if (summary) summary.value = entity?.summary ?? '';
  if (entityMode) entityMode.textContent = entity ? `编辑：${entity.name}` : '新建实体';
  const readOnly = project?.databaseMode !== 'read-write';
  const archived = entity?.status === 'archived';
  setWriteDisabled(readOnly);
  if (archiveButton) archiveButton.disabled = readOnly || !entity || archived;
  if (deleteButton) deleteButton.disabled = readOnly || !entity || !archived;
  if (factForm) {
    for (const control of factForm.elements) {
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLButtonElement
      ) {
        control.disabled = readOnly || !entity || archived;
      }
    }
  }
}

function renderFacts(entity: Entity | null): void {
  if (!factList) return;
  factList.replaceChildren();
  if (!entity) {
    factList.textContent = '选择实体后查看静态事实。';
    return;
  }
  if (entity.facts.length === 0) {
    factList.textContent = '尚无静态事实。';
    return;
  }
  for (const fact of entity.facts) {
    const row = document.createElement('article');
    row.className = 'canon-fact-row';
    row.dataset.canonFactStatus = fact.status;
    const heading = document.createElement('div');
    const key = document.createElement('strong');
    key.textContent = fact.factKey;
    const badge = document.createElement('span');
    badge.className = 'prototype-badge';
    badge.textContent = fact.status === 'current' ? 'CURRENT' : 'HISTORICAL';
    heading.append(key, badge);
    const value = document.createElement('pre');
    value.textContent = JSON.stringify(fact.value, null, 2);
    const metadata = document.createElement('small');
    metadata.textContent = `${new Date(fact.confirmedAt).toLocaleString('zh-CN')} · ${fact.sourceType}${fact.description ? ` · ${fact.description}` : ''}`;
    row.append(heading, value, metadata);
    factList.append(row);
  }
}

function renderCatalog(next: EntityCatalog): void {
  catalog = next;
  if (!entitySelect) return;
  const previous = selectedEntityId;
  entitySelect.replaceChildren(new Option('新建实体', ''));
  for (const entity of next.entities) {
    entitySelect.append(
      new Option(
        `${entityTypeLabels[entity.entityType]} · ${entity.name}${entity.status === 'archived' ? ' · 已归档' : ''}`,
        entity.id,
      ),
    );
  }
  selectedEntityId = next.entities.some((entity) => entity.id === previous) ? previous : null;
  entitySelect.value = selectedEntityId ?? '';
  const entity = selectedEntity();
  populateEntityForm(entity);
  renderFacts(entity);
}

async function resolveActiveProject(): Promise<ProjectWorkspaceSummary | null> {
  const result = await window.worldforge.project.getActive();
  if (!result.ok) {
    setStatus(`读取当前项目失败 · ${result.error.code}`, true);
    return null;
  }
  return result.data;
}

async function refreshCatalog(message = '正在读取实体与Canon…'): Promise<void> {
  project = await resolveActiveProject();
  if (!project) {
    setStatus('请先打开项目。', true);
    return;
  }
  setStatus(message);
  const result = await window.worldforge.canon.list({
    projectId: project.projectId,
    includeArchived: true,
  });
  if (!result.ok) {
    setStatus(`读取失败 · ${result.error.code}`, true);
    return;
  }
  renderCatalog(result.data);
  setStatus(
    project.databaseMode === 'read-write'
      ? `已加载 ${result.data.entities.length} 个实体。Canon仅接受作者明确命令。`
      : `当前项目只读；已加载 ${result.data.entities.length} 个实体。`,
  );
}

function aliasLines(value: FormDataEntryValue | null): string[] {
  return [...new Set(String(value ?? '').split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];
}

openButton?.addEventListener('click', () => {
  dialog?.showModal();
  void refreshCatalog();
});
closeButton?.addEventListener('click', () => dialog?.close());
refreshButton?.addEventListener('click', () => void refreshCatalog());
newButton?.addEventListener('click', () => {
  selectedEntityId = null;
  if (entitySelect) entitySelect.value = '';
  populateEntityForm(null);
  renderFacts(null);
  formControl('name')?.focus();
});
entitySelect?.addEventListener('change', () => {
  selectedEntityId = entitySelect.value || null;
  const entity = selectedEntity();
  populateEntityForm(entity);
  renderFacts(entity);
});

entityForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    if (!project || project.databaseMode !== 'read-write' || !entityForm) return;
    const data = new FormData(entityForm);
    const entityType = String(data.get('entityType')) as EntityType;
    const name = String(data.get('name') ?? '').trim();
    const aliases = aliasLines(data.get('aliases'));
    const summary = String(data.get('summary') ?? '').trim();
    if (!name) return setStatus('请输入实体名称。', true);
    setStatus(selectedEntityId ? '正在保存实体修改…' : '正在创建实体…');
    const result = selectedEntityId
      ? await window.worldforge.canon.update({
          projectId: project.projectId,
          authority: 'author',
          entityId: selectedEntityId,
          patch: { entityType, name, aliases, summary },
        })
      : await window.worldforge.canon.create({
          projectId: project.projectId,
          authority: 'author',
          entityType,
          name,
          aliases,
          summary,
        });
    if (!result.ok) return setStatus(`保存失败 · ${result.error.code}`, true);
    if (!selectedEntityId) {
      selectedEntityId = result.data.entities.find(
        (entity) => entity.name === name && entity.entityType === entityType,
      )?.id ?? null;
    }
    renderCatalog(result.data);
    setStatus('实体已由作者命令写入项目数据库。');
  })();
});

factForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    const entity = selectedEntity();
    if (!project || project.databaseMode !== 'read-write' || !factForm || !entity) return;
    const data = new FormData(factForm);
    const factKey = String(data.get('factKey') ?? '').trim();
    const rawValue = String(data.get('valueJson') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!factKey || !rawValue) return setStatus('请输入事实键和值。', true);
    let value: unknown;
    try {
      value = JSON.parse(rawValue);
    } catch {
      return setStatus('事实值必须是有效JSON。', true);
    }
    setStatus('正在确认静态事实；旧current将保留为historical…');
    const result = await window.worldforge.canon.setFact({
      projectId: project.projectId,
      authority: 'author',
      entityId: entity.id,
      factKey,
      value,
      description,
      sourceType: 'author',
      sourceId: null,
    });
    if (!result.ok) return setStatus(`事实保存失败 · ${result.error.code}`, true);
    renderCatalog(result.data);
    factForm.reset();
    setStatus('静态事实已确认；同一factKey仅保留一条current。');
  })();
});

archiveButton?.addEventListener('click', () => {
  void (async () => {
    const entity = selectedEntity();
    if (!project || project.databaseMode !== 'read-write' || !entity) return;
    if (!window.confirm(`确认归档“${entity.name}”？已有历史和引用不会被删除。`)) return;
    const result = await window.worldforge.canon.archive({
      projectId: project.projectId,
      authority: 'author',
      entityId: entity.id,
    });
    if (!result.ok) return setStatus(`归档失败 · ${result.error.code}`, true);
    renderCatalog(result.data);
    setStatus('实体已归档；永久删除仍需先通过引用影响预览。');
  })();
});

deleteButton?.addEventListener('click', () => {
  void (async () => {
    const entity = selectedEntity();
    if (!project || project.databaseMode !== 'read-write' || !entity) return;
    const preview = await window.worldforge.canon.previewDelete({
      projectId: project.projectId,
      entityId: entity.id,
    });
    if (!preview.ok) return setStatus(`影响预览失败 · ${preview.error.code}`, true);
    if (!preview.data.canDelete) {
      return setStatus(`禁止删除：${preview.data.blockers.join(' ')}`, true);
    }
    const confirmation = window.prompt(`输入实体名称“${entity.name}”确认永久删除：`);
    if (confirmation !== entity.name) return setStatus('名称确认不匹配，已取消删除。', true);
    const result = await window.worldforge.canon.delete({
      projectId: project.projectId,
      authority: 'author',
      entityId: entity.id,
      confirmName: confirmation,
    });
    if (!result.ok) return setStatus(`永久删除失败 · ${result.error.code}`, true);
    selectedEntityId = null;
    await refreshCatalog('实体已永久删除，正在刷新…');
  })();
});
