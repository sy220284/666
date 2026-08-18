import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { ProjectStructure, SearchResultItem } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import type {
  PrimaryNavigationAvailability,
  PrimaryNavigationId,
} from '../../shell/app-shell-model.js';
import {
  searchResultNavigationTarget,
  type AuthorNavigationTarget,
} from '../../shell/navigation-target.js';
import { filterCommandCatalog, type CommandCatalogEntry } from './command-catalog.js';
import { executeCatalogCommand } from './command-execution.js';
import type { RendererRouteId } from '../../state/ui-state-boundary.js';

type PaletteItem =
  | { readonly id: string; readonly kind: 'command'; readonly command: CommandCatalogEntry }
  | {
      readonly id: string;
      readonly kind: 'chapter' | 'foreshadowing' | 'search';
      readonly label: string;
      readonly description: string;
      readonly target: AuthorNavigationTarget;
    };

type SearchPaletteItem = {
  readonly id: string;
  readonly kind: 'search';
  readonly label: string;
  readonly description: string;
  readonly target: AuthorNavigationTarget;
};

interface CommandPaletteProps {
  readonly bridge: RendererBridgeAdapter;
  readonly open: boolean;
  readonly projectId: string | null;
  readonly availability: PrimaryNavigationAvailability;
  readonly onClose: () => void;
  readonly onNavigate: (id: PrimaryNavigationId) => void;
  readonly onTransitionToRoute: (route: RendererRouteId) => Promise<boolean>;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
  readonly onNavigateTarget: (target: AuthorNavigationTarget) => void;
}

export function CommandPalette({
  bridge,
  open,
  projectId,
  availability,
  onClose,
  onNavigate,
  onTransitionToRoute,
  returnFocusRef,
  onNavigateTarget,
}: CommandPaletteProps) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [structure, setStructure] = useState<ProjectStructure | null>(null);
  const [foreshadowingItems, setForeshadowingItems] = useState<readonly PaletteItem[]>([]);
  const [searchItems, setSearchItems] = useState<readonly PaletteItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState('输入名称搜索，或直接选择命令。');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    setSearchItems([]);
    setStatus('输入名称搜索，或直接选择命令。');
    window.requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  useEffect(() => {
    if (
      !open ||
      !projectId ||
      !(availability.planning || availability.writing || availability.canon || availability.checks)
    ) {
      setStructure(null);
      setForeshadowingItems([]);
      return;
    }
    let active = true;
    void Promise.all([
      bridge.planning.listStructure(projectId, {
        mode: 'replace',
        laneKey: `command-palette:structure:${projectId}`,
      }),
      bridge.narrativePlanning.list(
        { projectId, query: '', includeResolved: true, referenceChapterId: null },
        { mode: 'replace', laneKey: `command-palette:foreshadowing:${projectId}` },
      ),
    ]).then(([structureOutcome, narrativeOutcome]) => {
      if (!active) return;
      if (structureOutcome.state === 'success') setStructure(structureOutcome.data);
      if (narrativeOutcome.state === 'success') {
        setForeshadowingItems(
          narrativeOutcome.data.foreshadowings.map((item) => ({
            id: `foreshadowing:${item.id}`,
            kind: 'foreshadowing',
            label: item.title,
            description: `伏笔 · ${foreshadowingStatusLabel(item.status)}`,
            target: {
              type: 'foreshadowing',
              projectId,
              foreshadowingId: item.id,
              chapterId: item.revealFromChapterId ?? item.chapterLinks[0]?.chapterId ?? null,
              query: item.title,
            },
          })),
        );
      }
    });
    return () => {
      active = false;
    };
  }, [availability, bridge, open, projectId]);

  useEffect(() => {
    const normalized = query.trim();
    if (!open || !projectId || !normalized || !(availability.writing || availability.canon)) {
      setSearchItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus('正在搜索正文、历史版本与人物设定…');
      void bridge.searchTools
        .search(
          {
            projectId,
            query: normalized,
            sourceTypes: ['draft', 'version', 'entity'],
            includeArchived: false,
            limit: 40,
          },
          {
            mode: 'replace',
            laneKey: `command-palette:search:${projectId}`,
            signal: controller.signal,
          },
        )
        .then((outcome) => {
          if (controller.signal.aborted) return;
          if (outcome.state === 'success') {
            setSearchItems(
              searchItemsFromResults(projectId, normalized, outcome.data.items).filter((item) =>
                paletteTargetAllowed(item.target, availability),
              ),
            );
            setStatus(`全文搜索找到 ${outcome.data.items.length} 项。`);
          } else if (outcome.state === 'failure') {
            setSearchItems([]);
            setStatus(authorErrorSummary(outcome.error));
          }
        });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [availability, bridge, open, projectId, query]);

  const items = useMemo<readonly PaletteItem[]>(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    const commands: PaletteItem[] = filterCommandCatalog(
      query,
      projectId !== null,
      availability,
    ).map((command) => ({ id: `command:${command.id}`, kind: 'command', command }));
    if (!projectId) return commands;
    const chapters: PaletteItem[] = !availability.writing
      ? []
      : (structure?.volumes ?? []).flatMap((volume) =>
          volume.chapters
            .filter((chapter) =>
              normalized
                ? `${volume.title}\n${chapter.title}`
                    .toLocaleLowerCase('zh-CN')
                    .includes(normalized)
                : false,
            )
            .map((chapter) => ({
              id: `chapter:${chapter.id}`,
              kind: 'chapter' as const,
              label: chapter.title,
              description: `章节 · ${volume.title}`,
              target: {
                type: 'draft-block' as const,
                projectId,
                chapterId: chapter.id,
                logicalBlockId: null,
                query: null,
              },
            })),
        );
    const foreshadowing =
      normalized && availability.canon
        ? foreshadowingItems.filter((item) =>
            `${item.kind === 'command' ? item.command.label : item.label}\n${
              item.kind === 'command' ? item.command.description : item.description
            }`
              .toLocaleLowerCase('zh-CN')
              .includes(normalized),
          )
        : [];
    return [...commands, ...chapters, ...foreshadowing, ...searchItems].slice(0, 80);
  }, [availability, foreshadowingItems, projectId, query, searchItems, structure]);

  useEffect(() => setSelectedIndex(0), [items]);

  if (!open) return null;
  const selected = items[Math.min(selectedIndex, Math.max(0, items.length - 1))];

  const close = (): void => {
    onClose();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  const execute = (item: PaletteItem): void => {
    close();
    if (item.kind === 'command') {
      executeCatalogCommand(item.command, {
        projectId,
        onNavigate,
        onTransitionToRoute,
        onNavigateTarget,
      });
      return;
    }
    onNavigateTarget(item.target);
  };

  return (
    <div
      className="command-palette-backdrop"
      data-command-palette
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        aria-label="搜索与命令"
        aria-modal="true"
        className="command-palette"
        role="dialog"
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          } else if (event.key === 'Tab') {
            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ),
            );
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first && last) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last && first) {
              event.preventDefault();
              first.focus();
            }
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelectedIndex((index) => Math.min(items.length - 1, index + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedIndex((index) => Math.max(0, index - 1));
          } else if (event.key === 'Enter' && selected) {
            event.preventDefault();
            execute(selected);
          }
        }}
      >
        <header>
          <input
            ref={input}
            aria-label="搜索章节、人物、设定、伏笔、版本或命令"
            placeholder="搜索章节、人物、设定、伏笔、版本或命令"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>Esc</kbd>
        </header>
        <div aria-label="搜索与命令结果" className="command-palette__results" role="listbox">
          {items.map((item, index) => (
            <button
              aria-selected={index === selectedIndex}
              className="command-palette__result"
              data-command-kind={item.kind}
              key={item.id}
              role="option"
              type="button"
              onClick={() => execute(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span>
                <strong>{item.kind === 'command' ? item.command.label : item.label}</strong>
                <small>
                  {item.kind === 'command' ? item.command.description : item.description}
                </small>
              </span>
              <em>{paletteKindLabel(item)}</em>
            </button>
          ))}
          {!items.length ? <p className="command-palette__empty">没有匹配项。</p> : null}
        </div>
        <footer role="status">{status}</footer>
      </section>
    </div>
  );
}

function searchItemsFromResults(
  projectId: string,
  query: string,
  items: readonly SearchResultItem[],
): readonly SearchPaletteItem[] {
  return items.flatMap((item) => {
    const target = searchResultNavigationTarget(projectId, item, query);
    return target
      ? [
          {
            id: `search:${item.sourceType}:${item.targetId}:${item.anchorId ?? 'root'}`,
            kind: 'search' as const,
            label: item.title,
            description: `${searchSourceLabel(item.sourceType)} · ${item.excerpt}`,
            target,
          },
        ]
      : [];
  });
}

function searchSourceLabel(source: SearchResultItem['sourceType']): string {
  if (source === 'version') return '历史版本';
  if (source === 'entity') return '人物或设定';
  return '当前稿';
}

function foreshadowingStatusLabel(status: string): string {
  return (
    {
      planned: '计划中',
      planted: '已埋设',
      reinforced: '已强化',
      partially_revealed: '部分揭示',
      revealed: '已揭示',
      cancelled: '已取消',
    }[status] ?? status
  );
}

function paletteKindLabel(item: PaletteItem): string {
  if (item.kind === 'command') return item.command.kind === 'generation' ? '智能创作' : '页面';
  if (item.kind === 'chapter') return '章节';
  if (item.kind === 'foreshadowing') return '伏笔';
  return '全文搜索';
}

function paletteTargetAllowed(
  target: AuthorNavigationTarget,
  availability: PrimaryNavigationAvailability,
): boolean {
  if (target.type === 'entity' || target.type === 'foreshadowing') return availability.canon;
  if (
    target.type === 'plot-node' ||
    target.type === 'project-brief' ||
    target.type === 'scene-beat'
  )
    return availability.planning;
  if (target.type === 'validation-issue' || target.type === 'story-todo')
    return availability.checks;
  return availability.writing;
}
