import type { NarrativePlanningCatalog } from '@worldforge/contracts';

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

function warnings(values: readonly string[]): HTMLElement {
  const list = element('ul');
  list.dataset.narrativeWarnings = '';
  if (values.length === 0) list.append(element('li', '无提示'));
  else for (const value of values) list.append(element('li', value));
  return list;
}

function renderCatalog(host: HTMLElement, catalog: NarrativePlanningCatalog): void {
  const foreshadowingSection = element('section');
  foreshadowingSection.append(element('h3', `伏笔（${catalog.foreshadowings.length}）`));
  const foreshadowingList = element('ul');
  for (const item of catalog.foreshadowings) {
    const record = element('li');
    record.dataset.foreshadowingRecord = item.id;
    record.append(element('strong', item.title), ' ', identifier(item.id));
    const details = element('ul');
    details.append(
      element('li', `状态: ${item.status}`),
      element(
        'li',
        `回收窗口: ${item.revealFromChapterId ?? '未设'} — ${item.revealByChapterId ?? '未设'}`,
      ),
      element('li', `关注级别: ${item.attention}`),
      element(
        'li',
        `章节锚点: ${item.chapterLinks.map((link) => `${link.role}:${link.chapterId}`).join(', ') || '无'}`,
      ),
      element(
        'li',
        `关系: ${item.relations.map((relation) => `${relation.kind}:${relation.targetForeshadowingId}`).join(', ') || '无'}`,
      ),
    );
    details.append(warnings(item.warnings));
    record.append(details);
    foreshadowingList.append(record);
  }
  if (catalog.foreshadowings.length === 0) foreshadowingList.append(element('li', '无匹配伏笔'));
  foreshadowingSection.append(foreshadowingList);

  const arcSection = element('section');
  arcSection.append(element('h3', `人物弧光（${catalog.characterArcs.length}）`));
  const arcList = element('ul');
  for (const arc of catalog.characterArcs) {
    const record = element('li');
    record.dataset.characterArcRecord = arc.id;
    record.append(element('strong', arc.title), ' ', identifier(arc.id));
    const details = element('ul');
    details.append(
      element('li', `Character: ${arc.characterId}`),
      element('li', `类型: ${arc.customType ?? arc.arcType}`),
      element('li', `状态: ${arc.status}`),
      element('li', `作者意图: ${arc.authorIntent || '无'}`),
    );
    const milestones = element('ul');
    milestones.dataset.arcMilestones = arc.id;
    for (const milestone of arc.milestones) {
      const milestoneRecord = element('li');
      milestoneRecord.dataset.arcMilestoneRecord = milestone.id;
      milestoneRecord.append(
        element('strong', milestone.title),
        ` · ${milestone.status} · ${milestone.attention}`,
      );
      const milestoneDetails = element('ul');
      milestoneDetails.append(
        element('li', `计划章节: ${milestone.plannedChapterId ?? '未设'}`),
        element('li', `实际章节: ${milestone.actualChapterId ?? '未命中'}`),
        element('li', `确认来源: ${milestone.confirmationSource ?? '未确认'}`),
        element('li', `前置节点: ${milestone.dependencyMilestoneIds.join(', ') || '无'}`),
        element('li', `时间线依赖: ${milestone.dependencyTimelineEventIds.join(', ') || '无'}`),
      );
      milestoneDetails.append(warnings(milestone.warnings));
      milestoneRecord.append(milestoneDetails);
      milestones.append(milestoneRecord);
    }
    if (arc.milestones.length === 0) milestones.append(element('li', '尚无弧光节点'));
    details.append(milestones);
    record.append(details);
    arcList.append(record);
  }
  if (catalog.characterArcs.length === 0) arcList.append(element('li', '无匹配人物弧光'));
  arcSection.append(arcList);

  host.replaceChildren(foreshadowingSection, arcSection);
}

function mount(): void {
  const actions = document.querySelector<HTMLElement>('.active-project__actions');
  if (
    !window.worldforgeNarrativePlanning ||
    document.querySelector('[data-narrative-planning-dialog]') ||
    !actions
  ) {
    return;
  }
  const openButton = element('button', '伏笔与弧光');
  openButton.type = 'button';
  openButton.className = 'quiet-button';
  openButton.dataset.openNarrativePlanning = '';

  const dialog = element('dialog');
  dialog.dataset.narrativePlanningDialog = '';
  const title = element('h2', '伏笔生命周期与人物弧光');
  const status = element('p', '尚未读取');
  status.dataset.narrativePlanningStatus = '';
  const query = element('input');
  query.type = 'search';
  query.placeholder = '搜索伏笔、弧光或节点';
  query.setAttribute('aria-label', '搜索伏笔与弧光');
  query.dataset.narrativePlanningQuery = '';
  const referenceChapter = element('input');
  referenceChapter.type = 'text';
  referenceChapter.placeholder = '可选：参考章节UUID';
  referenceChapter.setAttribute('aria-label', '参考章节ID');
  referenceChapter.dataset.narrativeReferenceChapter = '';
  const resolvedLabel = element('label');
  const includeResolved = element('input');
  includeResolved.type = 'checkbox';
  includeResolved.checked = true;
  includeResolved.dataset.narrativeIncludeResolved = '';
  resolvedLabel.append(includeResolved, ' 包含已回收、取消或结束记录');
  const refresh = element('button', '读取');
  refresh.type = 'button';
  refresh.dataset.refreshNarrativePlanning = '';
  const close = element('button', '关闭');
  close.type = 'button';
  const results = element('div');
  results.dataset.narrativePlanningResults = '';

  const load = async (): Promise<void> => {
    status.textContent = '读取中…';
    const active = await window.worldforge.project.getActive();
    if (!active.ok || !active.data) {
      status.textContent = '请先打开项目。';
      results.replaceChildren();
      return;
    }
    const response = await window.worldforgeNarrativePlanning.list({
      projectId: active.data.projectId,
      query: query.value,
      includeResolved: includeResolved.checked,
      referenceChapterId: referenceChapter.value.trim() || null,
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
  includeResolved.addEventListener('change', () => void load());
  referenceChapter.addEventListener('change', () => void load());
  close.addEventListener('click', () => dialog.close());
  dialog.append(title, status, query, referenceChapter, resolvedLabel, refresh, close, results);
  actions.append(openButton);
  document.body.append(dialog);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
