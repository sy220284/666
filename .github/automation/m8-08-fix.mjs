import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function text(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

async function write(relative, content) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function replaceExact(relative, before, after) {
  const source = await text(relative);
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${relative}: expected one match, found ${count}`);
  await write(relative, source.replace(before, after));
}

await write(
  'packages/editor-core/src/persisted-metadata-sync.ts',
  `import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { DraftSnapshotEditorBlock, Editor, PersistedEditorBlock } from './draft-document.js';

const LOCK_COMMAND_META = 'worldforgeLockCommand';

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function headingLevel(node: ProseMirrorNode): number {
  const value = Number(node.attrs.headingLevel);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 2;
}

function snapshotHeadingLevel(block: DraftSnapshotEditorBlock): number {
  const value = Number(block.attributes.headingLevel);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 2;
}

function persistedHeadingLevel(block: PersistedEditorBlock): number {
  const value = Number(block.attributes.headingLevel);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 2;
}

function snapshotMatchesPersisted(
  snapshot: DraftSnapshotEditorBlock,
  block: PersistedEditorBlock,
): boolean {
  if (snapshot.blockType !== block.blockType || snapshot.text !== block.text) return false;
  if (snapshot.logicalBlockId && snapshot.logicalBlockId !== block.logicalBlockId) return false;
  return (
    snapshot.blockType !== 'heading' ||
    snapshotHeadingLevel(snapshot) === persistedHeadingLevel(block)
  );
}

function nodeMatchesSnapshot(node: ProseMirrorNode, snapshot: DraftSnapshotEditorBlock): boolean {
  if (node.type.name !== snapshot.blockType || node.textContent !== snapshot.text) return false;
  return snapshot.blockType !== 'heading' || headingLevel(node) === snapshotHeadingLevel(snapshot);
}

function nodeMatchesPersisted(node: ProseMirrorNode, block: PersistedEditorBlock): boolean {
  if (node.type.name !== block.blockType || node.textContent !== block.text) return false;
  return block.blockType !== 'heading' || headingLevel(node) === persistedHeadingLevel(block);
}

function requestMapping(
  blocks: readonly PersistedEditorBlock[],
  requestSnapshot: readonly DraftSnapshotEditorBlock[],
): ReadonlyMap<string, PersistedEditorBlock> | null {
  if (requestSnapshot.length !== blocks.length) return null;
  const mapped = new Map<string, PersistedEditorBlock>();
  for (const [index, savedBlock] of requestSnapshot.entries()) {
    const persisted = blocks[index];
    if (!persisted || mapped.has(savedBlock.clientBlockId)) return null;
    if (!snapshotMatchesPersisted(savedBlock, persisted)) return null;
    mapped.set(savedBlock.clientBlockId, persisted);
  }
  return mapped;
}

function metadataForCurrentNode(
  node: ProseMirrorNode,
  block: PersistedEditorBlock,
  savedSnapshotStillCurrent: boolean,
): Record<string, unknown> {
  return {
    ...node.attrs,
    logicalBlockId: block.logicalBlockId,
    clientBlockId: optionalString(node.attrs.clientBlockId) ?? block.logicalBlockId,
    source: savedSnapshotStillCurrent ? block.source : node.attrs.source,
    locked: savedSnapshotStillCurrent ? block.locked : node.attrs.locked,
    contentHash: block.contentHash,
    ...(node.type.name === 'heading' ? { headingLevel: headingLevel(node) } : {}),
  };
}

/**
 * Synchronizes persisted metadata through the immutable snapshot owned by the exact save request.
 * Current text, structure, selection and history are never replaced by an asynchronous response.
 */
export function synchronizePersistedBlockMetadata(
  editor: Editor,
  blocks: readonly PersistedEditorBlock[],
  requestSnapshot: readonly DraftSnapshotEditorBlock[],
): boolean {
  const persistedById = new Map<string, PersistedEditorBlock>();
  for (const block of blocks) {
    if (persistedById.has(block.logicalBlockId)) return false;
    persistedById.set(block.logicalBlockId, block);
  }

  const persistedByClientId = requestMapping(blocks, requestSnapshot);
  const savedByClientId = new Map(requestSnapshot.map((block) => [block.clientBlockId, block]));
  const transaction = editor.state.tr;
  const usedPersistedIds = new Set<string>();
  let synchronized = 0;

  editor.state.doc.forEach((node, offset) => {
    const clientBlockId = optionalString(node.attrs.clientBlockId);
    const logicalBlockId = optionalString(node.attrs.logicalBlockId);
    const clientMatch = clientBlockId ? persistedByClientId?.get(clientBlockId) : undefined;
    const stableMatch = logicalBlockId ? persistedById.get(logicalBlockId) : undefined;
    if (clientMatch && stableMatch && clientMatch.logicalBlockId !== stableMatch.logicalBlockId) return;
    const block = clientMatch ?? stableMatch;
    if (!block || usedPersistedIds.has(block.logicalBlockId)) return;

    const savedBlock = clientBlockId ? savedByClientId.get(clientBlockId) : undefined;
    const savedSnapshotStillCurrent = savedBlock
      ? nodeMatchesSnapshot(node, savedBlock)
      : nodeMatchesPersisted(node, block);
    transaction.setNodeMarkup(
      offset,
      undefined,
      metadataForCurrentNode(node, block, savedSnapshotStillCurrent),
    );
    usedPersistedIds.add(block.logicalBlockId);
    synchronized += 1;
  });

  if (synchronized === 0) return false;
  transaction.setMeta('addToHistory', false);
  transaction.setMeta(LOCK_COMMAND_META, true);
  editor.view.dispatch(transaction);
  return true;
}
`,
);

await replaceExact(
  'packages/editor-core/src/draft-patch.ts',
  "import { rememberPendingDraftSnapshot } from './persisted-metadata-sync.js';\n\n",
  '',
);
await replaceExact(
  'packages/editor-core/src/draft-patch.ts',
  "  const operations = [...unlocks, ...deletions, ...moves, ...inserts, ...updates, ...locks];\n  if (operations.length > 0) rememberPendingDraftSnapshot(current);\n  return operations;",
  "  return [...unlocks, ...deletions, ...moves, ...inserts, ...updates, ...locks];",
);

await replaceExact(
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
  "  const activeChapter = useRef<Chapter | null>(null);\n  const composing = useRef(false);",
  "  const activeChapter = useRef<Chapter | null>(null);\n  const editorGeneration = useRef(0);\n  const composing = useRef(false);",
);
await replaceExact(
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
  `      const signature = JSON.stringify(json);
      assertEditorNodeMetadata(json);
      const nextBlocks = tiptapJsonToDraftSnapshot(json, temporaryClientBlockId);
      const operations = buildDraftPatchOperations(persistedBlocks(currentDraft), nextBlocks);
      if (operations.length === 0) return true;
      const result = await bridge.draft.applyPatch({
        projectId: project.projectId,
        chapterId: currentChapter.id,
        draftId: currentDraft.draftId,
        baseRevision: currentDraft.revision,
        operations,
      });
      if (result.state !== 'success') return false;
      if (
        activeChapter.current?.id !== currentChapter.id ||
        activeDraft.current?.draftId !== currentDraft.draftId ||
        editor.current !== instance
      ) {
        return true;
      }
      activeDraft.current = result.data;
      setDraft(result.data);
      synchronizing.current = true;
      const synchronized = synchronizePersistedBlockMetadata(
        instance,
        persistedBlocks(result.data),
      );
      if (!synchronized) {
        instance.commands.setContent(documentToTiptapJson(persistedBlocks(result.data)), {
          emitUpdate: false,
        });
      }
      synchronizing.current = false;`,
  `      const signature = JSON.stringify(json);
      assertEditorNodeMetadata(json);
      const nextBlocks = tiptapJsonToDraftSnapshot(json, temporaryClientBlockId);
      const saveContext = {
        projectId: project.projectId,
        chapterId: currentChapter.id,
        draftId: currentDraft.draftId,
        baseRevision: currentDraft.revision,
        editorGeneration: editorGeneration.current,
        documentFingerprint: signature,
        blockIdentityMap: new Map(nextBlocks.map((block) => [block.clientBlockId, block.logicalBlockId])),
        requestSnapshot: nextBlocks,
        requestedAt: Date.now(),
      };
      const operations = buildDraftPatchOperations(persistedBlocks(currentDraft), nextBlocks);
      if (operations.length === 0) return true;
      const result = await bridge.draft.applyPatch({
        projectId: saveContext.projectId,
        chapterId: saveContext.chapterId,
        draftId: saveContext.draftId,
        baseRevision: saveContext.baseRevision,
        operations,
      });
      if (result.state !== 'success') {
        setStatus(
          result.state === 'failure'
            ? authorErrorSummary(result.error)
            : '保存请求已取消；当前窗口内容仍保留。',
          true,
        );
        return false;
      }
      if (
        activeChapter.current?.id !== saveContext.chapterId ||
        activeDraft.current?.draftId !== saveContext.draftId ||
        editor.current !== instance ||
        editorGeneration.current !== saveContext.editorGeneration
      ) {
        return true;
      }
      activeDraft.current = result.data;
      setDraft(result.data);
      synchronizing.current = true;
      synchronizePersistedBlockMetadata(
        instance,
        persistedBlocks(result.data),
        saveContext.requestSnapshot,
      );
      synchronizing.current = false;`,
);
await replaceExact(
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
  "`${savedStatus('已保存', result.data.revision, disclosureMode)}${JSON.stringify(instance.getJSON()) === signature ? '' : ' · 编辑器仍有新输入'}`",
  "`${savedStatus('已保存', result.data.revision, disclosureMode)}${JSON.stringify(instance.getJSON()) === saveContext.documentFingerprint ? '' : ' · 编辑器仍有新输入'}`",
);
await replaceExact(
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
  "      autosave.current?.destroy();\n      autosave.current = null;\n      instance?.destroy();",
  "      autosave.current?.destroy();\n      autosave.current = null;\n      editorGeneration.current += 1;\n      instance?.destroy();",
);

await replaceExact(
  'apps/desktop/renderer/src/components/draft-flush-failure-dialog.tsx',
  `  const openRecovery = (): void => {
    setOpen(false);
    dispatch({ type: 'navigate', route: 'recovery' });
  };`,
  `  const openRecovery = async (): Promise<void> => {
    setRetrying(true);
    const saved = await flushRegisteredDraft();
    setRetrying(false);
    if (!saved) {
      setNotice(
        '恢复中心不会在当前稿尚未安全保存时切走写作页面。请先重试保存，或复制当前正文后处理本地服务。',
      );
      return;
    }
    setOpen(false);
    dispatch({ type: 'navigate', route: 'recovery' });
  };`,
);
await replaceExact(
  'apps/desktop/renderer/src/components/draft-flush-failure-dialog.tsx',
  `<button type="button" onClick={openRecovery}>
            打开恢复中心
          </button>`,
  `<button disabled={retrying} type="button" onClick={() => void openRecovery()}>
            打开恢复中心
          </button>`,
);

await write(
  'apps/desktop/renderer/src/features/checks/generation-polling-policy.ts',
  `export const MAX_GENERATION_POLL_FAILURES = 5;

export function generationPollingDelay(failureCount: number): number {
  return Math.min(5_000, 1_000 * 2 ** Math.min(Math.max(0, failureCount), 2));
}

export function registerGenerationPollingFailure(failureCount: number): {
  readonly failureCount: number;
  readonly terminal: boolean;
  readonly delayMs: number;
} {
  const nextFailureCount = failureCount + 1;
  return {
    failureCount: nextFailureCount,
    terminal: nextFailureCount >= MAX_GENERATION_POLL_FAILURES,
    delayMs: generationPollingDelay(nextFailureCount),
  };
}
`,
);
await replaceExact(
  'apps/desktop/renderer/src/features/checks/checks-workbench.tsx',
  "import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';\nimport { RhythmPanel } from './rhythm-panel.js';",
  "import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';\nimport {\n  generationPollingDelay,\n  registerGenerationPollingFailure,\n} from './generation-polling-policy.js';\nimport { RhythmPanel } from './rhythm-panel.js';",
);
await replaceExact(
  'apps/desktop/renderer/src/features/checks/checks-workbench.tsx',
  `function pollingDelay(failureCount: number): number {
  return Math.min(5_000, 1_000 * 2 ** Math.min(failureCount, 2));
}

`,
  '',
);
await replaceExact(
  'apps/desktop/renderer/src/features/checks/checks-workbench.tsx',
  `        } else if (outcome.state === 'failure') {
          failureCount += 1;
          setNotice(\`AI语义检查状态读取失败：\${authorErrorSummary(outcome.error)}，将自动重试。\`);
        } else if (outcome.state === 'cancelled') {`,
  `        } else if (outcome.state === 'failure') {
          const decision = registerGenerationPollingFailure(failureCount);
          failureCount = decision.failureCount;
          terminal = decision.terminal;
          if (terminal) {
            setPending(false);
            setActiveRun(null);
            setNotice(
              \`AI语义检查状态连续读取失败：\${authorErrorSummary(outcome.error)}。自动重试已停止，请重新运行。\`,
            );
          } else {
            setNotice(\`AI语义检查状态读取失败：\${authorErrorSummary(outcome.error)}，将自动重试。\`);
          }
        } else if (outcome.state === 'cancelled') {`,
);
await replaceExact(
  'apps/desktop/renderer/src/features/checks/checks-workbench.tsx',
  `      } catch {
        if (!active) return;
        failureCount += 1;
        setNotice('AI语义检查状态暂时无法读取，将自动重试。');
      }
      if (!terminal) schedule(pollingDelay(failureCount));`,
  `      } catch {
        if (!active) return;
        const decision = registerGenerationPollingFailure(failureCount);
        failureCount = decision.failureCount;
        terminal = decision.terminal;
        if (terminal) {
          setPending(false);
          setActiveRun(null);
          setNotice('AI语义检查状态连续无法读取。自动重试已停止，请重新运行。');
        } else {
          setNotice('AI语义检查状态暂时无法读取，将自动重试。');
        }
      }
      if (!terminal) schedule(generationPollingDelay(failureCount));`,
);

await replaceExact(
  'apps/desktop/renderer/src/runtime/capability-runtime.ts',
  `    providers: trackDomain('providers', bridge.providers, (method, outcome) => {
      if (method !== 'list' || outcome.state !== 'success') return;
      const data = outcome.data as { readonly providers?: readonly unknown[] };
      state.providerCount = data.providers?.length ?? 0;
    }),`,
  `    providers: trackDomain('providers', bridge.providers, (method, outcome) => {
      if (outcome.state !== 'success') return;
      if (method === 'list') {
        const data = outcome.data as { readonly providers?: readonly unknown[] };
        state.providerCount = data.providers?.length ?? 0;
        state.verifiedProviderCount = Math.min(
          state.verifiedProviderCount,
          state.providerCount,
        );
        return;
      }
      if (method === 'testConnection') {
        state.verifiedProviderCount = Math.max(1, state.verifiedProviderCount);
        return;
      }
      if (method === 'save' || method === 'remove') state.verifiedProviderCount = 0;
    }),`,
);

await replaceExact(
  'apps/desktop/main/src/electron-main.ts',
  `    const rendererReady = await window.webContents
      .executeJavaScript('document.body.dataset.rendererReady === "true"', true)
      .catch(() => false);
    if (rendererReady === true && supervisor.getStatus().status === 'healthy') {`,
  `    const productReady = await window.webContents
      .executeJavaScript('document.body.dataset.productReady === "true"', true)
      .catch(() => false);
    if (productReady === true && supervisor.getStatus().status === 'healthy') {`,
);
await replaceExact(
  'scripts/smoke-packaged-desktop.mjs',
  `    const result = {
      product: manifest.product,
      coreStatus: 'healthy',
      rendererReady: 'true',
    };
    if (result.product !== 'WorldForge') {`,
  `    const result = {
      product: manifest.product,
      coreStatus: 'healthy',
      rendererReady: 'true',
      productReady: 'true',
    };
    if (result.product !== 'WorldForge' || result.productReady !== 'true') {`,
);

await write(
  'tests/unit/editor-persisted-metadata-sync.test.ts',
  `import { describe, expect, it } from 'vitest';

import {
  EditorState,
  createWorldforgeEditorSchema,
  type DraftSnapshotEditorBlock,
  type PersistedEditorBlock,
} from '../../packages/editor-core/src/draft-document.js';
import { synchronizePersistedBlockMetadata } from '../../packages/editor-core/src/persisted-metadata-sync.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const schema = createWorldforgeEditorSchema();

function saved(clientBlockId: string, logicalBlockId: string | null, text: string): DraftSnapshotEditorBlock {
  return { clientBlockId, logicalBlockId, blockType: 'paragraph', text, attributes: {}, locked: false };
}

function persisted(logicalBlockId: string, text: string): PersistedEditorBlock {
  return {
    logicalBlockId,
    blockType: 'paragraph',
    text,
    attributes: {},
    source: 'manual',
    locked: false,
    contentHash: \`hash-\${logicalBlockId}\`,
  };
}

function editorFor(blocks: readonly DraftSnapshotEditorBlock[]) {
  let state = EditorState.create({
    doc: schema.nodeFromJSON({
      type: 'chapterDocument',
      content: blocks.map((block) => ({
        type: block.blockType,
        attrs: {
          logicalBlockId: block.logicalBlockId,
          clientBlockId: block.clientBlockId,
          source: 'manual',
          locked: block.locked,
          contentHash: block.logicalBlockId ? \`old-\${block.logicalBlockId}\` : null,
        },
        content: block.text ? [{ type: 'text', text: block.text }] : undefined,
      })),
    }),
  });
  return {
    editor: contractInput<Parameters<typeof synchronizePersistedBlockMetadata>[0]>({
      get state() { return state; },
      view: { dispatch(transaction: Parameters<typeof state.apply>[0]) { state = state.apply(transaction); } },
    }),
    state: () => state,
  };
}

describe('request-bound persisted metadata synchronization', () => {
  it('maps duplicate reordered text by the exact request client identity', () => {
    const request = [saved('client-a', null, '相同'), saved('client-b', null, '相同')];
    const target = editorFor([saved('client-b', null, '相同'), saved('client-a', null, '相同')]);
    expect(synchronizePersistedBlockMetadata(target.editor, [persisted('server-a', '相同'), persisted('server-b', '相同')], request)).toBe(true);
    expect(target.state().doc.child(0).attrs.logicalBlockId).toBe('server-b');
    expect(target.state().doc.child(1).attrs.logicalBlockId).toBe('server-a');
  });

  it('keeps later text while attaching the persisted identity from the same request', () => {
    const request = [saved('client-a', null, '保存快照')];
    const target = editorFor([saved('client-a', null, '保存后继续输入')]);
    synchronizePersistedBlockMetadata(target.editor, [persisted('server-a', '保存快照')], request);
    expect(target.state().doc.firstChild?.textContent).toBe('保存后继续输入');
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBe('server-a');
  });

  it('rejects a response that does not match the explicit request snapshot', () => {
    const target = editorFor([saved('client-new', null, '新请求')]);
    expect(synchronizePersistedBlockMetadata(target.editor, [persisted('server-old', '旧请求')], [saved('client-old', null, '旧请求')])).toBe(false);
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBeNull();
  });

  it('does not guess an identity for a node without a stable client id', () => {
    const target = editorFor([saved('', null, '粘贴正文')]);
    expect(synchronizePersistedBlockMetadata(target.editor, [persisted('server-a', '粘贴正文')], [saved('request-client', null, '粘贴正文')])).toBe(false);
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBeNull();
  });
});
`,
);

await write(
  'tests/unit/editor-persisted-metadata-isolation.test.ts',
  `import { describe, expect, it } from 'vitest';

import {
  EditorState,
  createWorldforgeEditorSchema,
  type DraftSnapshotEditorBlock,
  type PersistedEditorBlock,
} from '../../packages/editor-core/src/draft-document.js';
import { synchronizePersistedBlockMetadata } from '../../packages/editor-core/src/persisted-metadata-sync.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const schema = createWorldforgeEditorSchema();
const snapshot = (clientBlockId: string, text: string): DraftSnapshotEditorBlock => ({ clientBlockId, logicalBlockId: null, blockType: 'paragraph', text, attributes: {}, locked: false });
const persisted = (logicalBlockId: string, text: string): PersistedEditorBlock => ({ logicalBlockId, blockType: 'paragraph', text, attributes: {}, source: 'manual', locked: false, contentHash: \`hash-\${logicalBlockId}\` });

function editorFor(clientBlockId: string, text: string) {
  let state = EditorState.create({ doc: schema.nodeFromJSON({ type: 'chapterDocument', content: [{ type: 'paragraph', attrs: { logicalBlockId: null, clientBlockId, source: 'manual', locked: false, contentHash: null }, content: [{ type: 'text', text }] }] }) });
  return {
    editor: contractInput<Parameters<typeof synchronizePersistedBlockMetadata>[0]>({ get state() { return state; }, view: { dispatch(transaction: Parameters<typeof state.apply>[0]) { state = state.apply(transaction); } } }),
    state: () => state,
  };
}

describe('save request isolation', () => {
  it('does not bind another chapter request with identical content', () => {
    const target = editorFor('chapter-b', '相同正文');
    expect(synchronizePersistedBlockMetadata(target.editor, [persisted('server-a', '相同正文')], [snapshot('chapter-a', '相同正文')])).toBe(false);
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBeNull();
  });

  it('binds the exact active chapter request', () => {
    const target = editorFor('chapter-b', '相同正文');
    expect(synchronizePersistedBlockMetadata(target.editor, [persisted('server-b', '相同正文')], [snapshot('chapter-b', '相同正文')])).toBe(true);
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBe('server-b');
  });
});
`,
);

await write(
  'tests/unit/editor-persisted-metadata-missing-client-id.test.ts',
  `import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { createWorldforgeEditorExtensions } from '../../packages/editor-core/src/draft-document.js';

describe('editor client identity invariant', () => {
  it('installs the identity extension that repairs missing and duplicate client ids', () => {
    const extensions = createWorldforgeEditorExtensions(() => 'generated-client');
    expect(extensions.some((extension) => extension.name === 'worldforgeClientIdentity')).toBe(true);
  });

  it('does not retain the former module-global pending snapshot protocol', async () => {
    const source = await readFile('packages/editor-core/src/persisted-metadata-sync.ts', 'utf8');
    expect(source).not.toContain('pendingSnapshot');
    expect(source).not.toContain('rememberPendingDraftSnapshot');
  });
});
`,
);

await write(
  'tests/unit/writing-save-context-contract.test.ts',
  `import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('writing save request contract', () => {
  it('carries immutable request context into metadata synchronization', async () => {
    const source = await readFile('apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx', 'utf8');
    expect(source).toContain('const saveContext = {');
    expect(source).toContain('editorGeneration: editorGeneration.current');
    expect(source).toContain('blockIdentityMap: new Map');
    expect(source).toContain('saveContext.requestSnapshot');
    expect(source).not.toContain('if (!synchronized)');
  });
});
`,
);

await write(
  'tests/unit/generation-polling-policy.test.ts',
  `import { describe, expect, it } from 'vitest';

import {
  MAX_GENERATION_POLL_FAILURES,
  generationPollingDelay,
  registerGenerationPollingFailure,
} from '../../apps/desktop/renderer/src/features/checks/generation-polling-policy.js';

describe('generation polling failure policy', () => {
  it('backs off with an upper bound', () => {
    expect([0, 1, 2, 3, 20].map(generationPollingDelay)).toEqual([1000, 2000, 4000, 5000, 5000]);
  });

  it('stops after the bounded consecutive failure budget', () => {
    let failures = 0;
    let terminal = false;
    for (let index = 0; index < MAX_GENERATION_POLL_FAILURES; index += 1) {
      const decision = registerGenerationPollingFailure(failures);
      failures = decision.failureCount;
      terminal = decision.terminal;
    }
    expect(failures).toBe(MAX_GENERATION_POLL_FAILURES);
    expect(terminal).toBe(true);
  });
});
`,
);

await write(
  'tests/unit/capability-runtime-provider.test.ts',
  `import { afterEach, describe, expect, it } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  createCapabilityTrackingBridge,
  resetCapabilityRuntimeForTests,
} from '../../apps/desktop/renderer/src/runtime/capability-runtime.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const success = <Data>(data: Data) => ({ state: 'success' as const, data });

afterEach(() => resetCapabilityRuntimeForTests());

describe('provider capability tracking', () => {
  it('publishes generation readiness after a successful connection test and invalidates it on save', async () => {
    const dataset: Record<string, string> = {};
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { dataset } } });
    const bridge = createCapabilityTrackingBridge(contractInput<RendererBridgeAdapter>({
      app: { getCoreStatus: async () => success({ status: 'healthy', pid: 1, restartCount: 0, lastErrorCode: null, diagnosticId: null }) },
      settings: {},
      project: {},
      task: {},
      providers: {
        list: async () => success({ providers: [{ id: 'provider-1' }] }),
        testConnection: async () => success({ providerId: 'provider-1', actualModel: 'local', latencyMs: 1 }),
        save: async () => success({ id: 'provider-1' }),
      },
    }));
    await bridge.app.getCoreStatus();
    await bridge.providers.list();
    await bridge.providers.testConnection('provider-1');
    expect(dataset.coreReady).toBe('true');
    await bridge.providers.save({});
    expect(dataset.coreReady).toBe('true');
  });
});
`,
);

await write(
  'tests/unit/draft-flush-recovery-safety.test.ts',
  `import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('draft flush failure recovery navigation', () => {
  it('requires a successful retry before leaving the writing route', async () => {
    const source = await readFile('apps/desktop/renderer/src/components/draft-flush-failure-dialog.tsx', 'utf8');
    const retry = source.indexOf('const saved = await flushRegisteredDraft()');
    const guard = source.indexOf('if (!saved)');
    const navigation = source.indexOf("dispatch({ type: 'navigate', route: 'recovery' })");
    expect(retry).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(retry);
    expect(navigation).toBeGreaterThan(guard);
  });
});
`,
);

await write(
  'tests/unit/packaged-product-readiness.test.ts',
  `import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('packaged product readiness', () => {
  it('waits for productReady rather than renderer mount alone', async () => {
    const main = await readFile('apps/desktop/main/src/electron-main.ts', 'utf8');
    const smoke = await readFile('scripts/smoke-packaged-desktop.mjs', 'utf8');
    expect(main).toContain('document.body.dataset.productReady === "true"');
    expect(main).not.toContain('document.body.dataset.rendererReady === "true"');
    expect(smoke).toContain("productReady: 'true'");
  });
});
`,
);

await replaceExact(
  'tests/unit/checks-generation-polling.test.ts',
  "    expect(source).toContain('Math.min(5_000');",
  "    expect(source).toContain('registerGenerationPollingFailure');\n    expect(source).toContain('自动重试已停止');",
);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(target)));
    else files.push(target);
  }
  return files;
}

const sourceFiles = await collectFiles(path.join(root, 'apps'));
sourceFiles.push(...(await collectFiles(path.join(root, 'packages'))));
for (const file of sourceFiles.filter((candidate) => /\.(?:ts|tsx)$/u.test(candidate))) {
  const source = await readFile(file, 'utf8');
  if (source.includes('rememberPendingDraftSnapshot') || source.includes('pendingSnapshot')) {
    throw new Error(`Legacy pending snapshot state remains in ${path.relative(root, file)}`);
  }
}
