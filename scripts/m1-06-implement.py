from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    if old not in source:
        raise SystemExit(f"Anchor missing in {path}: {old[:120]!r}")
    file.write_text(source.replace(old, new, 1))


Path("packages/editor-core/src/autosave.ts").write_text(
    """export type AutosaveState = 'idle' | 'waiting' | 'paused' | 'saving' | 'saved' | 'failed';

export interface DraftAutosaveOptions {
  readonly delayMs: number;
  readonly save: () => Promise<boolean>;
  readonly onState?: (state: AutosaveState) => void;
}

export class DraftAutosaveCoordinator {
  readonly #delayMs: number;
  readonly #save: () => Promise<boolean>;
  readonly #onState: ((state: AutosaveState) => void) | undefined;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #inFlight: Promise<boolean> | null = null;
  #dirty = false;
  #paused = false;
  #destroyed = false;

  constructor(options: DraftAutosaveOptions) {
    if (!Number.isInteger(options.delayMs) || options.delayMs < 0) {
      throw new Error('AUTOSAVE_DELAY_INVALID');
    }
    this.#delayMs = options.delayMs;
    this.#save = options.save;
    this.#onState = options.onState;
  }

  get hasPendingWork(): boolean {
    return this.#dirty || this.#inFlight !== null;
  }

  markDirty(): void {
    if (this.#destroyed) return;
    this.#dirty = true;
    if (!this.#paused && !this.#inFlight) this.#schedule();
  }

  pause(): void {
    if (this.#destroyed) return;
    this.#paused = true;
    this.#clearTimer();
    this.#emit('paused');
  }

  resume(): void {
    if (this.#destroyed) return;
    this.#paused = false;
    if (this.#dirty && !this.#inFlight) this.#schedule();
    else this.#emit('idle');
  }

  async flush(): Promise<boolean> {
    if (this.#destroyed) return true;
    this.#clearTimer();
    if (this.#paused) return false;
    if (this.#inFlight) {
      const completed = await this.#inFlight;
      if (!completed) return false;
      if (this.#dirty) return this.flush();
      return true;
    }
    if (!this.#dirty) return true;

    this.#dirty = false;
    this.#emit('saving');
    const operation = this.#save().catch(() => false);
    this.#inFlight = operation;
    const completed = await operation;
    if (this.#inFlight === operation) this.#inFlight = null;
    if (!completed) {
      this.#dirty = true;
      this.#emit('failed');
      return false;
    }
    this.#emit('saved');
    if (this.#dirty) return this.flush();
    return true;
  }

  destroy(): void {
    this.#destroyed = true;
    this.#clearTimer();
    this.#onState?.('idle');
  }

  #schedule(): void {
    this.#clearTimer();
    this.#emit('waiting');
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.flush();
    }, this.#delayMs);
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #emit(state: AutosaveState): void {
    this.#onState?.(state);
  }
}
"""
)

Path("packages/editor-core/src/writing-tools.ts").write_text(
    """export interface WritingStatistics {
  readonly characterCount: number;
  readonly textCount: number;
  readonly paragraphCount: number;
  readonly progressPercent: number | null;
}

export interface TextRange {
  readonly from: number;
  readonly to: number;
}

export function calculateWritingStatistics(
  text: string,
  paragraphCount: number,
  targetWordMax?: number | null,
): WritingStatistics {
  const compact = text.replace(/\\s/gu, '');
  const characterCount = Array.from(compact).length;
  const textCount = Array.from(compact.matchAll(/[\\p{L}\\p{N}]/gu)).length;
  const maximum = targetWordMax && targetWordMax > 0 ? targetWordMax : null;
  return {
    characterCount,
    textCount,
    paragraphCount: Math.max(0, Math.trunc(paragraphCount)),
    progressPercent: maximum === null ? null : Math.min(100, Math.round((textCount / maximum) * 100)),
  };
}

export function findTextRanges(
  text: string,
  query: string,
  caseSensitive = false,
): readonly TextRange[] {
  if (!query) return [];
  const source = caseSensitive ? text : text.toLocaleLowerCase();
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  if (!needle) return [];
  const ranges: TextRange[] = [];
  let offset = 0;
  while (offset <= source.length - needle.length) {
    const found = source.indexOf(needle, offset);
    if (found < 0) break;
    ranges.push({ from: found, to: found + query.length });
    offset = found + Math.max(1, query.length);
  }
  return ranges;
}

export function replaceTextRanges(
  text: string,
  query: string,
  replacement: string,
  replaceAll: boolean,
  caseSensitive = false,
): string {
  const ranges = findTextRanges(text, query, caseSensitive);
  const selected = replaceAll ? ranges : ranges.slice(0, 1);
  let result = text;
  for (const range of [...selected].reverse()) {
    result = result.slice(0, range.from) + replacement + result.slice(range.to);
  }
  return result;
}
"""
)

index_path = Path("packages/editor-core/src/index.ts")
index_source = index_path.read_text()
for export in ["export * from './autosave.js';", "export * from './writing-tools.js';"]:
    if export not in index_source:
        index_source += f"\n{export}\n"
index_path.write_text(index_source)

renderer = "apps/desktop/renderer/src/index.ts"
replace_once(renderer, "  Editor,\n  assertEditorNodeMetadata,", "  DraftAutosaveCoordinator,\n  Editor,\n  assertEditorNodeMetadata,")
replace_once(renderer, "  buildDraftPatchOperations,\n  createWorldforgeEditorExtensions,", "  buildDraftPatchOperations,\n  calculateWritingStatistics,\n  createWorldforgeEditorExtensions,\n  findTextRanges,")
replace_once(
    renderer,
    "const blockTypeButtons = document.querySelectorAll<HTMLButtonElement>('[data-set-block-type]');\n",
    """const blockTypeButtons = document.querySelectorAll<HTMLButtonElement>('[data-set-block-type]');
const draftCharacterCount = document.querySelector<HTMLElement>('[data-draft-character-count]');
const draftTextCount = document.querySelector<HTMLElement>('[data-draft-text-count]');
const draftParagraphCount = document.querySelector<HTMLElement>('[data-draft-paragraph-count]');
const draftProgress = document.querySelector<HTMLElement>('[data-draft-progress]');
const draftFindInput = document.querySelector<HTMLInputElement>('[data-draft-find]');
const draftReplaceInput = document.querySelector<HTMLInputElement>('[data-draft-replace]');
const draftFindPrevious = document.querySelector<HTMLButtonElement>('[data-draft-find-previous]');
const draftFindNext = document.querySelector<HTMLButtonElement>('[data-draft-find-next]');
const draftReplaceCurrent = document.querySelector<HTMLButtonElement>('[data-draft-replace-current]');
const draftReplaceAll = document.querySelector<HTMLButtonElement>('[data-draft-replace-all]');
const draftFindStatus = document.querySelector<HTMLElement>('[data-draft-find-status]');
""",
)
replace_once(
    renderer,
    "let synchronizingDraftMetadata = false;\nconst chapterSelections",
    """let synchronizingDraftMetadata = false;
let draftAutosave: DraftAutosaveCoordinator | null = null;
let lastSavedRevision = 0;
let currentFindIndex = -1;
let draftFindMatches: { readonly from: number; readonly to: number }[] = [];
const chapterSelections""",
)

stats_and_find = r"""
function updateDraftStatistics(): void {
  const editor = draftEditor;
  if (!editor) {
    if (draftCharacterCount) draftCharacterCount.textContent = '0';
    if (draftTextCount) draftTextCount.textContent = '0';
    if (draftParagraphCount) draftParagraphCount.textContent = '0';
    if (draftProgress) draftProgress.textContent = '未设置目标';
    return;
  }
  const statistics = calculateWritingStatistics(
    editor.getText({ blockSeparator: '\n' }),
    editor.state.doc.childCount,
    activeChapter?.targetWordMax,
  );
  if (draftCharacterCount) draftCharacterCount.textContent = String(statistics.characterCount);
  if (draftTextCount) draftTextCount.textContent = String(statistics.textCount);
  if (draftParagraphCount) draftParagraphCount.textContent = String(statistics.paragraphCount);
  if (draftProgress) {
    draftProgress.textContent =
      statistics.progressPercent === null ? '未设置目标' : `目标进度 ${statistics.progressPercent}%`;
  }
}

function refreshDraftFindMatches(selectCurrent = false): void {
  const editor = draftEditor;
  const query = draftFindInput?.value ?? '';
  draftFindMatches = [];
  if (editor && query) {
    editor.state.doc.descendants((node, position) => {
      if (!node.isText || !node.text) return;
      for (const range of findTextRanges(node.text, query)) {
        draftFindMatches.push({ from: position + range.from, to: position + range.to });
      }
    });
  }
  if (draftFindMatches.length === 0) currentFindIndex = -1;
  else if (currentFindIndex < 0 || currentFindIndex >= draftFindMatches.length) currentFindIndex = 0;
  if (draftFindStatus) {
    draftFindStatus.textContent =
      draftFindMatches.length === 0 ? (query ? '未找到' : '') : `${currentFindIndex + 1}/${draftFindMatches.length}`;
  }
  if (selectCurrent && editor && currentFindIndex >= 0) {
    editor.commands.setTextSelection(draftFindMatches[currentFindIndex]!);
    editor.commands.focus();
  }
}

function moveDraftFind(direction: 1 | -1): void {
  refreshDraftFindMatches();
  if (!draftEditor || draftFindMatches.length === 0) return;
  currentFindIndex = (currentFindIndex + direction + draftFindMatches.length) % draftFindMatches.length;
  refreshDraftFindMatches(true);
}

function replaceDraftFind(all: boolean): void {
  const editor = draftEditor;
  if (!editor || activeProject?.databaseMode !== 'read-write') return;
  refreshDraftFindMatches();
  if (draftFindMatches.length === 0) return;
  const replacement = draftReplaceInput?.value ?? '';
  const selected = all ? draftFindMatches : [draftFindMatches[currentFindIndex]!];
  let transaction = editor.state.tr;
  for (const match of [...selected].reverse()) {
    transaction = transaction.insertText(replacement, match.from, match.to);
  }
  editor.view.dispatch(transaction);
  currentFindIndex = 0;
  refreshDraftFindMatches(true);
}
"""
replace_once(renderer, "function showProjectOverview(): void {", stats_and_find + "\nfunction showProjectOverview(): void {")
replace_once(renderer, "  draftEditor?.destroy();\n  draftEditor = null;", "  draftAutosave?.destroy();\n  draftAutosave = null;\n  draftEditor?.destroy();\n  draftEditor = null;")
replace_once(renderer, "  synchronizingDraftMetadata = false;\n  if (saveDraftButton)", "  synchronizingDraftMetadata = false;\n  currentFindIndex = -1;\n  draftFindMatches = [];\n  updateDraftStatistics();\n  if (draftFindStatus) draftFindStatus.textContent = '';\n  if (saveDraftButton)")
replace_once(
    renderer,
    "      draftDirty = true;\n      setDraftState(draftComposing ? '输入法组合中；保存与结构键已暂停。' : '有未保存修改。');",
    "      draftDirty = true;\n      updateDraftStatistics();\n      refreshDraftFindMatches();\n      draftAutosave?.markDirty();\n      if (draftComposing) setDraftState('输入法组合中；自动保存与结构键已暂停。');",
)
replace_once(
    renderer,
    "  const savedSelection = chapterSelections.get(chapter.id);",
    """  lastSavedRevision = draft.revision;
  draftAutosave = new DraftAutosaveCoordinator({
    delayMs: 800,
    save: persistActiveDraft,
    onState: (state) => {
      if (state === 'waiting') setDraftState('等待自动保存…');
      else if (state === 'saving') setDraftState('正在自动保存…');
      else if (state === 'saved') setDraftState(`自动保存完成 · Revision ${lastSavedRevision}`);
      else if (state === 'failed') setDraftState('自动保存失败；窗口内容仍保留。', true);
      else if (state === 'paused') setDraftState('输入法组合中；自动保存与结构键已暂停。');
    },
  });
  updateDraftStatistics();
  refreshDraftFindMatches();
  const savedSelection = chapterSelections.get(chapter.id);""",
)
replace_once(
    renderer,
    "  if (draftDirty && !window.confirm('当前正文尚未手动保存。放弃修改并切换章节？')) return;",
    "  if (draftAutosave?.hasPendingWork && !(await draftAutosave.flush())) {\n    setDraftState('自动保存失败，已阻止切换章节。', true);\n    return;\n  }",
)

source = Path(renderer).read_text()
start = source.index("async function saveActiveDraft(): Promise<void> {")
end = source.index("\nfunction treeAction(", start)
replacement = r"""async function persistActiveDraft(): Promise<boolean> {
  const project = activeProject;
  const chapter = activeChapter;
  const draft = activeDraft;
  const editor = draftEditor;
  if (!project || !chapter || !draft || !editor || project.databaseMode !== 'read-write') return true;
  if (draftComposing || editor.view.composing) return false;
  saveDraftButton?.setAttribute('disabled', '');
  try {
    const json = editor.getJSON();
    const signature = JSON.stringify(json);
    assertEditorNodeMetadata(json);
    const blocks = tiptapJsonToDraftSnapshot(json, temporaryClientBlockId);
    const operations = buildDraftPatchOperations(persistedBlocks(draft), blocks);
    if (operations.length === 0) {
      draftDirty = false;
      return true;
    }
    const result = await window.worldforge.draft.applyPatch({
      projectId: project.projectId,
      chapterId: chapter.id,
      draftId: draft.draftId,
      baseRevision: draft.revision,
      operations,
    });
    if (!result.ok) return false;
    if (
      activeProject?.projectId !== project.projectId ||
      activeChapter?.id !== chapter.id ||
      activeDraft?.draftId !== draft.draftId ||
      draftEditor !== editor
    ) {
      return true;
    }
    activeDraft = result.data;
    lastSavedRevision = result.data.revision;
    synchronizingDraftMetadata = true;
    const synchronized = synchronizePersistedBlockMetadata(editor, persistedBlocks(result.data));
    if (!synchronized) {
      editor.commands.setContent(documentToTiptapJson(persistedBlocks(result.data)), { emitUpdate: false });
    }
    synchronizingDraftMetadata = false;
    draftDirty = JSON.stringify(editor.getJSON()) !== signature;
    updateDraftStatistics();
    void refreshProjectStructure();
    return true;
  } catch {
    synchronizingDraftMetadata = false;
    return false;
  } finally {
    if (saveDraftButton) {
      saveDraftButton.disabled = draftComposing || activeProject?.databaseMode !== 'read-write';
    }
  }
}

async function saveActiveDraft(): Promise<boolean> {
  const completed = await (draftAutosave?.flush() ?? Promise.resolve(true));
  if (completed) setDraftState(`已手动保存 · Revision ${lastSavedRevision}`);
  else setDraftState('手动保存失败；窗口内容仍保留。', true);
  return completed;
}
"""
Path(renderer).write_text(source[:start] + replacement + source[end:])
replace_once(
    renderer,
    "backProjectButton?.addEventListener('click', () => {\n  if (draftDirty && !window.confirm('当前正文尚未手动保存。放弃修改并返回项目？')) return;\n  destroyDraftEditor();\n  showProjectOverview();\n  renderProjectStructure(activeStructure);\n});",
    """backProjectButton?.addEventListener('click', () => {
  void (async () => {
    if (draftAutosave?.hasPendingWork && !(await draftAutosave.flush())) {
      setDraftState('自动保存失败，已阻止返回项目。', true);
      return;
    }
    destroyDraftEditor();
    showProjectOverview();
    renderProjectStructure(activeStructure);
  })();
});""",
)
replace_once(renderer, "draftEditorHost?.addEventListener('compositionstart', () => {\n  draftComposing = true;", "draftEditorHost?.addEventListener('compositionstart', () => {\n  draftComposing = true;\n  draftAutosave?.pause();")
replace_once(renderer, "  setDraftState('输入法组合已完成，有未保存修改。');\n});", "  draftAutosave?.resume();\n  if (draftDirty) draftAutosave?.markDirty();\n});")
replace_once(
    renderer,
    "closeProjectButton?.addEventListener('click', async () => {\n  const project = activeProject;",
    "closeProjectButton?.addEventListener('click', async () => {\n  const project = activeProject;\n  if (draftAutosave?.hasPendingWork && !(await draftAutosave.flush())) {\n    setDraftState('自动保存失败，已阻止关闭项目。', true);\n    return;\n  }",
)
find_events = """draftFindInput?.addEventListener('input', () => {
  currentFindIndex = 0;
  refreshDraftFindMatches(true);
});
draftFindPrevious?.addEventListener('click', () => moveDraftFind(-1));
draftFindNext?.addEventListener('click', () => moveDraftFind(1));
draftReplaceCurrent?.addEventListener('click', () => replaceDraftFind(false));
draftReplaceAll?.addEventListener('click', () => replaceDraftFind(true));

"""
replace_once(renderer, "undoDraftButton?.addEventListener('click', () => {", find_events + "undoDraftButton?.addEventListener('click', () => {")
renderer_path = Path(renderer)
renderer_path.write_text(renderer_path.read_text() + "\nObject.defineProperty(globalThis, 'worldforgeFlushDraft', {\n  configurable: true,\n  value: () => draftAutosave?.flush() ?? Promise.resolve(true),\n});\n")

html = "apps/desktop/renderer/src/index.html"
replace_once(
    html,
    """                  </div>
                  <p class="draft-state" data-draft-state role="status" aria-live="polite"></p>
                  <div class="draft-editor-host" data-draft-editor-host></div>""",
    """                  </div>
                  <div class="draft-metrics" aria-label="正文统计">
                    <span>字符 <strong data-draft-character-count>0</strong></span>
                    <span>纯文字 <strong data-draft-text-count>0</strong></span>
                    <span>段落 <strong data-draft-paragraph-count>0</strong></span>
                    <span data-draft-progress>未设置目标</span>
                  </div>
                  <div class="draft-find" aria-label="当前章节查找替换">
                    <input type="search" data-draft-find placeholder="查找当前章节" aria-label="查找文本" />
                    <button type="button" data-draft-find-previous>上一个</button>
                    <button type="button" data-draft-find-next>下一个</button>
                    <span data-draft-find-status aria-live="polite"></span>
                    <input type="text" data-draft-replace placeholder="替换为" aria-label="替换文本" />
                    <button type="button" data-draft-replace-current>替换</button>
                    <button type="button" data-draft-replace-all>全部替换</button>
                  </div>
                  <p class="draft-state" data-draft-state role="status" aria-live="polite"></p>
                  <div class="draft-editor-host" data-draft-editor-host></div>""",
)
replace_once(html, "当前任务提供显式保存；800ms 自动保存将在 M1-06\n                     接入。中文输入组合期间不会执行拆分、合并或保存。", "正文修改空闲800ms后自动保存；切换章节、返回项目与关闭应用前会强制刷新。中文输入组合期间暂停保存。")

styles = Path("apps/desktop/renderer/src/styles.css")
styles.write_text(
    styles.read_text()
    + """

.draft-metrics,
.draft-find {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 0.68em;
}

.draft-metrics { color: var(--color-text-muted); }
.draft-metrics strong { color: var(--color-text-primary); }
.draft-find input {
  min-width: 120px;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 5px;
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
}
.draft-find button {
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 5px;
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  cursor: pointer;
}
"""
)

main = "apps/desktop/main/src/electron-main.ts"
replace_once(
    main,
    """  const gracefulShutdown = (): Promise<void> => {
    if (shutdownInFlight) return shutdownInFlight;
    shutdownInFlight = (async () => {
      await flushWindowPreferences();""",
    """  const flushRendererDraft = async (): Promise<boolean> => {
    const window = mainWindow;
    if (!window || window.isDestroyed()) return true;
    try {
      return Boolean(
        await window.webContents.executeJavaScript(
          'globalThis.worldforgeFlushDraft ? globalThis.worldforgeFlushDraft() : true',
          true,
        ),
      );
    } catch {
      return false;
    }
  };

  const gracefulShutdown = (): Promise<void> => {
    if (shutdownInFlight) return shutdownInFlight;
    shutdownInFlight = (async () => {
      if (!(await flushRendererDraft())) {
        await logger.log('error', 'draft.autosave.flush.failed', {
          errorCode: 'DB_WRITE_FAILED_004',
          processStatus: supervisor.getStatus().status,
        });
        mainWindow?.show();
        shutdownInFlight = null;
        return;
      }
      await flushWindowPreferences();""",
)

Path("tests/unit/autosave-writing-tools.test.ts").write_text(
    """import { describe, expect, it, vi } from 'vitest';

import {
  DraftAutosaveCoordinator,
  calculateWritingStatistics,
  findTextRanges,
  replaceTextRanges,
} from '@worldforge/editor-core';

describe('DraftAutosaveCoordinator', () => {
  it('waits 800ms and coalesces changes made during a save', async () => {
    vi.useFakeTimers();
    let saves = 0;
    let release: ((value: boolean) => void) | undefined;
    const coordinator = new DraftAutosaveCoordinator({
      delayMs: 800,
      save: async () => {
        saves += 1;
        if (saves === 1) return new Promise<boolean>((resolve) => (release = resolve));
        return true;
      },
    });
    coordinator.markDirty();
    await vi.advanceTimersByTimeAsync(799);
    expect(saves).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(saves).toBe(1);
    coordinator.markDirty();
    release?.(true);
    await vi.runAllTimersAsync();
    expect(saves).toBe(2);
    coordinator.destroy();
    vi.useRealTimers();
  });

  it('pauses during composition and flushes after resume', async () => {
    vi.useFakeTimers();
    let saves = 0;
    const coordinator = new DraftAutosaveCoordinator({ delayMs: 800, save: async () => (++saves, true) });
    coordinator.pause();
    coordinator.markDirty();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(saves).toBe(0);
    coordinator.resume();
    await vi.advanceTimersByTimeAsync(800);
    expect(saves).toBe(1);
    coordinator.destroy();
    vi.useRealTimers();
  });
});

describe('writing tools', () => {
  it('uses one Unicode-aware statistics algorithm', () => {
    expect(calculateWritingStatistics('雨落。 Wind 42', 2, 10)).toEqual({
      characterCount: 9,
      textCount: 8,
      paragraphCount: 2,
      progressPercent: 80,
    });
  });

  it('finds and replaces non-overlapping chapter matches', () => {
    expect(findTextRanges('风起，风又起', '风')).toEqual([{ from: 0, to: 1 }, { from: 3, to: 4 }]);
    expect(replaceTextRanges('风起，风又起', '风', '雨', true)).toBe('雨起，雨又起');
  });
});
"""
)
Path("tests/performance").mkdir(parents=True, exist_ok=True)
Path("tests/performance/writing-tools-performance.test.ts").write_text(
    """import { expect, it } from 'vitest';

import { calculateWritingStatistics, findTextRanges } from '@worldforge/editor-core';

it('updates statistics and chapter find within 50ms for a 2K chapter', () => {
  const text = `${'雨落旧城，风过长街。'.repeat(200)}`.slice(0, 2_000);
  const started = performance.now();
  const statistics = calculateWritingStatistics(text, 200, 3_000);
  const matches = findTextRanges(text, '长街');
  const elapsed = performance.now() - started;
  expect(statistics.characterCount).toBe(2_000);
  expect(matches.length).toBeGreaterThan(0);
  expect(elapsed).toBeLessThan(50);
});
"""
)

e2e = Path("tests/e2e/electron-shell.spec.ts")
e2e_source = e2e.read_text()
old = """    await expect(blocks.first()).toHaveText('雨落在旧站台。风起。');

    await page.waitForTimeout(600);"""
new = """    await expect(blocks.first()).toHaveText('雨落在旧站台。风起。');
    await expect(page.locator('[data-draft-character-count]')).toHaveText('10');
    await expect(page.locator('[data-draft-text-count]')).toHaveText('8');
    await expect(page.locator('[data-draft-paragraph-count]')).toHaveText('1');
    await expect(page.locator('[data-draft-state]')).toContainText('等待自动保存');
    await expect(page.locator('[data-draft-state]')).toHaveText(/^自动保存完成 · Revision \\d+$/u, {
      timeout: 3_000,
    });
    await page.locator('[data-draft-find]').fill('风起');
    await page.locator('[data-draft-find-next]').click();
    await expect(page.locator('[data-draft-find-status]')).toHaveText('1/1');
    await page.locator('[data-draft-replace]').fill('风又起');
    await page.locator('[data-draft-replace-current]').click();
    await expect(blocks.first()).toHaveText('雨落在旧站台。风又起。');

    await page.waitForTimeout(600);"""
if old not in e2e_source:
    raise SystemExit("M1-06 E2E insertion anchor missing")
e2e_source = e2e_source.replace(old, new, 1).replace("雨落在旧站台。终风起。", "雨落在旧站台。终风又起。")
e2e.write_text(e2e_source)
