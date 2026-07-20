import type { Entity, EntityType } from '@worldforge/contracts';

const dialog = document.querySelector<HTMLDialogElement>('[data-scene-beat-dialog]');
const characterSource = document.querySelector<HTMLTextAreaElement>(
  '[data-scene-beat-dialog] textarea[name="characterIds"]',
);
const locationSource = document.querySelector<HTMLTextAreaElement>(
  '[data-scene-beat-dialog] textarea[name="locationIds"]',
);

interface SelectorBinding {
  readonly source: HTMLTextAreaElement;
  readonly select: HTMLSelectElement;
  readonly entityType: Extract<EntityType, 'character' | 'location'>;
  readonly emptyLabel: string;
}

function selectedIds(source: HTMLTextAreaElement): Set<string> {
  return new Set(
    source.value
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function synchronizeSource(binding: SelectorBinding): void {
  binding.source.value = [...binding.select.selectedOptions].map((option) => option.value).join('\n');
  binding.source.dispatchEvent(new Event('input', { bubbles: true }));
}

function createBinding(
  source: HTMLTextAreaElement | null,
  entityType: SelectorBinding['entityType'],
  label: string,
  emptyLabel: string,
): SelectorBinding | null {
  if (!source) return null;
  source.hidden = true;
  source.setAttribute('aria-hidden', 'true');
  const select = document.createElement('select');
  select.multiple = true;
  select.size = 6;
  select.setAttribute('aria-label', label);
  select.dataset.sceneBeatEntitySelector = entityType;
  source.before(select);
  const binding = { source, select, entityType, emptyLabel } satisfies SelectorBinding;
  select.addEventListener('change', () => synchronizeSource(binding));
  return binding;
}

const bindings = [
  createBinding(characterSource, 'character', '关联人物', '当前项目暂无可选人物'),
  createBinding(locationSource, 'location', '关联地点', '当前项目暂无可选地点'),
].filter((binding): binding is SelectorBinding => binding !== null);

function renderBinding(binding: SelectorBinding, entities: readonly Entity[]): void {
  const selected = selectedIds(binding.source);
  binding.select.replaceChildren();
  const matching = entities.filter(
    (entity) => entity.entityType === binding.entityType && entity.status === 'active',
  );
  if (matching.length === 0) {
    const option = new Option(binding.emptyLabel, '');
    option.disabled = true;
    binding.select.append(option);
    binding.select.disabled = true;
    return;
  }
  binding.select.disabled = false;
  for (const entity of matching) {
    const option = new Option(entity.name, entity.id, false, selected.has(entity.id));
    option.title = entity.aliases.length > 0 ? `别名：${entity.aliases.join('、')}` : entity.summary;
    binding.select.append(option);
  }
  synchronizeSource(binding);
}

async function refreshSelectors(): Promise<void> {
  if (!dialog?.open || bindings.length === 0) return;
  for (const binding of bindings) binding.select.disabled = true;
  const active = await window.worldforge.project.getActive();
  if (!active.ok || !active.data) return;
  const catalog = await window.worldforge.canon.list({
    projectId: active.data.projectId,
    includeArchived: false,
  });
  if (!catalog.ok) return;
  for (const binding of bindings) renderBinding(binding, catalog.data.entities);
}

if (dialog && bindings.length > 0) {
  const observer = new MutationObserver(() => {
    if (dialog.open) void refreshSelectors();
  });
  observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  dialog.addEventListener('close', () => {
    for (const binding of bindings) binding.select.replaceChildren();
  });
}
