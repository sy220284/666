import {
  StateProposalResolutionSchema,
  type StateProposal,
  type StateProposalCatalog,
} from '@worldforge/contracts';

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  text?: string,
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function evidenceText(proposal: StateProposal): string {
  return proposal.evidence
    .map((anchor) => `${anchor.kind}:${anchor.targetId}${anchor.note ? `（${anchor.note}）` : ''}`)
    .join('；');
}

function renderSnapshot(
  host: HTMLElement,
  source: 'snapshot' | 'fallback_live_query',
  content: {
    readonly entityStates: readonly unknown[];
    readonly knowledgeStates: readonly unknown[];
    readonly foreshadowings: readonly unknown[];
    readonly arcMilestones: readonly unknown[];
  },
): void {
  const section = element('section');
  section.dataset.endingSnapshot = source;
  section.append(
    element('h3', source === 'snapshot' ? '章节尾快照' : '权威表实时回退'),
    element(
      'p',
      `实体状态 ${content.entityStates.length} · 知情状态 ${content.knowledgeStates.length} · 伏笔 ${content.foreshadowings.length} · 弧光节点 ${content.arcMilestones.length}`,
    ),
  );
  const details = element('details');
  details.append(element('summary', '查看快照内容'), element('pre', json(content)));
  section.append(details);
  host.replaceChildren(section);
}

function proposalRecord(
  proposal: StateProposal,
  resolve: (proposal: StateProposal, decision: 'accept' | 'edit_accept' | 'reject') => void,
): HTMLElement {
  const record = element('article');
  record.dataset.stateProposal = proposal.id;
  record.append(
    element(
      'h3',
      proposal.proposalType === 'entity_state'
        ? `实体状态 · ${proposal.stateKey ?? '未知字段'}`
        : '人物弧光节点',
    ),
    element('p', `状态：${proposal.status} · 置信度：${Math.round(proposal.confidence * 100)}%`),
    element('p', `章节：${proposal.chapterId} · Version：${proposal.sourceVersionId}`),
    element('p', `证据：${evidenceText(proposal)}`),
  );
  const values = element('div');
  const previous = element('pre', json(proposal.previousValue));
  previous.dataset.stateProposalPrevious = '';
  const proposed = element('pre', json(proposal.proposedValue));
  proposed.dataset.stateProposalProposed = '';
  values.append(element('strong', '旧值'), previous, element('strong', '提议值'), proposed);
  if (proposal.resolvedValue !== null) {
    const resolved = element('pre', json(proposal.resolvedValue));
    resolved.dataset.stateProposalResolved = '';
    values.append(element('strong', '最终值'), resolved);
  }
  record.append(values);

  if (proposal.status === 'pending') {
    const actions = element('div');
    const accept = element('button', '接受');
    accept.type = 'button';
    accept.dataset.acceptStateProposal = proposal.id;
    accept.addEventListener('click', () => resolve(proposal, 'accept'));
    const edit = element('button', '编辑后接受');
    edit.type = 'button';
    edit.dataset.editAcceptStateProposal = proposal.id;
    edit.addEventListener('click', () => resolve(proposal, 'edit_accept'));
    const reject = element('button', '拒绝');
    reject.type = 'button';
    reject.dataset.rejectStateProposal = proposal.id;
    reject.addEventListener('click', () => resolve(proposal, 'reject'));
    actions.append(accept, edit, reject);
    record.append(actions);
  }
  return record;
}

function renderCatalog(
  host: HTMLElement,
  catalog: StateProposalCatalog,
  resolve: (proposal: StateProposal, decision: 'accept' | 'edit_accept' | 'reject') => void,
): void {
  if (catalog.proposals.length === 0) {
    host.replaceChildren(element('p', '当前没有状态提案。'));
    return;
  }
  host.replaceChildren(...catalog.proposals.map((proposal) => proposalRecord(proposal, resolve)));
}

function mount(): void {
  const actions = document.querySelector<HTMLElement>('.active-project__actions');
  if (
    !window.worldforgeStateProposal ||
    document.querySelector('[data-state-proposal-dialog]') ||
    !actions
  ) {
    return;
  }

  const open = element('button', '状态提案');
  open.type = 'button';
  open.className = 'quiet-button';
  open.dataset.openStateProposals = '';

  const dialog = element('dialog');
  dialog.dataset.stateProposalDialog = '';
  const title = element('h2', '状态提案与章节尾快照');
  const description = element(
    'p',
    'pending提案不会改变权威状态。接受、编辑后接受或拒绝均由作者明确裁决。',
  );
  const status = element('p', '尚未读取');
  status.dataset.stateProposalStatus = '';
  const chapter = element('input');
  chapter.type = 'text';
  chapter.placeholder = '可选：章节UUID；填写后同时读取尾快照';
  chapter.setAttribute('aria-label', '状态提案章节ID');
  chapter.dataset.stateProposalChapter = '';
  const includeResolvedLabel = element('label');
  const includeResolved = element('input');
  includeResolved.type = 'checkbox';
  includeResolved.checked = true;
  includeResolved.dataset.stateProposalIncludeResolved = '';
  includeResolvedLabel.append(includeResolved, ' 包含已裁决提案');
  const refresh = element('button', '读取');
  refresh.type = 'button';
  refresh.dataset.refreshStateProposals = '';
  const close = element('button', '关闭');
  close.type = 'button';
  const list = element('div');
  list.dataset.stateProposalList = '';
  const snapshot = element('div');
  snapshot.dataset.stateProposalSnapshot = '';

  let projectId: string | null = null;

  const load = async (): Promise<void> => {
    status.textContent = '读取中…';
    const active = await window.worldforge.project.getActive();
    if (!active.ok || !active.data) {
      projectId = null;
      status.textContent = '请先打开项目。';
      list.replaceChildren();
      snapshot.replaceChildren();
      return;
    }
    projectId = active.data.projectId;
    const chapterId = chapter.value.trim() || null;
    const response = await window.worldforgeStateProposal.list({
      projectId,
      chapterId,
      includeResolved: includeResolved.checked,
    });
    if (!response.ok) {
      status.textContent = `读取失败：${response.error.code}`;
      list.replaceChildren();
      snapshot.replaceChildren();
      return;
    }
    status.textContent = `项目：${active.data.name} · 提案 ${response.data.proposals.length}`;
    renderCatalog(list, response.data, resolve);
    if (!chapterId) {
      snapshot.replaceChildren(element('p', '填写章节UUID后读取尾快照。'));
      return;
    }
    const snapshotResponse = await window.worldforgeStateProposal.readSnapshot({
      projectId,
      chapterId,
    });
    if (!snapshotResponse.ok) {
      snapshot.replaceChildren(element('p', `快照读取失败：${snapshotResponse.error.code}`));
      return;
    }
    renderSnapshot(snapshot, snapshotResponse.data.snapshotSource, snapshotResponse.data.content);
  };

  const resolve = async (
    proposal: StateProposal,
    decision: 'accept' | 'edit_accept' | 'reject',
  ): Promise<void> => {
    if (!projectId) return;
    let resolution = StateProposalResolutionSchema.parse({
      proposalId: proposal.id,
      decision,
    });
    if (decision === 'edit_accept') {
      const edited = window.prompt('请输入合法JSON作为最终值：', json(proposal.proposedValue));
      if (edited === null) {
        status.textContent = '已取消编辑接受。';
        return;
      }
      try {
        resolution = StateProposalResolutionSchema.parse({
          proposalId: proposal.id,
          decision,
          editedValue: JSON.parse(edited) as unknown,
        });
      } catch {
        status.textContent = 'JSON格式无效，未执行裁决。';
        return;
      }
    }
    status.textContent = '提交作者裁决…';
    const response = await window.worldforgeStateProposal.resolve({
      projectId,
      authority: 'author',
      resolutions: [resolution],
    });
    if (!response.ok) {
      status.textContent = `裁决失败：${response.error.code}`;
      return;
    }
    await load();
  };

  open.addEventListener('click', () => {
    dialog.showModal();
    void load();
  });
  refresh.addEventListener('click', () => void load());
  chapter.addEventListener('change', () => void load());
  includeResolved.addEventListener('change', () => void load());
  close.addEventListener('click', () => dialog.close());

  dialog.append(
    title,
    description,
    status,
    chapter,
    includeResolvedLabel,
    refresh,
    close,
    list,
    snapshot,
  );
  actions.append(open);
  document.body.append(dialog);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
