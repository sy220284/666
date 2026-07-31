import { beforeEach, describe, expect, it } from 'vitest';

import {
  EditorState,
  createWorldforgeEditorSchema,
  type DraftSnapshotEditorBlock,
  type PersistedEditorBlock,
  type WorldforgeBlockSource,
} from '../../packages/editor-core/src/draft-document.js';
import { buildDraftPatchOperations } from '../../packages/editor-core/src/draft-patch.js';
import {
  rememberPendingDraftSnapshot,
  resetPendingDraftSnapshotsForTests,
  synchronizePersistedBlockMetadata,
} from '../../packages/editor-core/src/persisted-metadata-sync.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const schema = createWorldforgeEditorSchema();

function persisted(
  logicalBlockId: string,
  text: string,
  overrides: Partial<PersistedEditorBlock> = {},
): PersistedEditorBlock {
  return {
    logicalBlockId,
    blockType: 'paragraph',
    text,
    attributes: {},
    source: 'manual',
    locked: false,
    contentHash: `hash-${logicalBlockId}`,
    ...overrides,
  };
}

function snapshot(
  clientBlockId: string,
  logicalBlockId: string | null,
  text: string,
  overrides: Partial<DraftSnapshotEditorBlock> = {},
): DraftSnapshotEditorBlock {
  return {
    clientBlockId,
    logicalBlockId,
    blockType: 'paragraph',
    text,
    attributes: {},
    locked: false,
    ...overrides,
  };
}

function editorFor(
  blocks: ReadonlyArray<{
    logicalBlockId: string | null;
    clientBlockId: string;
    text: string;
    blockType?: 'paragraph' | 'dialogue' | 'heading';
    headingLevel?: number;
    source?: WorldforgeBlockSource;
    locked?: boolean;
  }>,
) {
  let state = EditorState.create({
    doc: schema.nodeFromJSON({
      type: 'chapterDocument',
      content: blocks.map((block) => ({
        type: block.blockType ?? 'paragraph',
        attrs: {
          logicalBlockId: block.logicalBlockId,
          clientBlockId: block.clientBlockId,
          source: block.source ?? 'manual',
          locked: block.locked ?? false,
          contentHash: block.logicalBlockId ? `old-${block.logicalBlockId}` : null,
          ...(block.blockType === 'heading' ? { headingLevel: block.headingLevel ?? 2 } : {}),
        },
        content: block.text ? [{ type: 'text', text: block.text }] : undefined,
      })),
    }),
  });
  const editor = contractInput<Parameters<typeof synchronizePersistedBlockMetadata>[0]>({
    get state() {
      return state;
    },
    view: {
      dispatch(transaction: Parameters<typeof state.apply>[0]) {
        state = state.apply(transaction);
      },
    },
  });
  return { editor, state: () => state };
}

beforeEach(() => resetPendingDraftSnapshotsForTests());

describe('persisted metadata synchronization during delayed autosave', () => {
  it('assigns a new server identity through the immutable client-block snapshot', () => {
    const target = editorFor([
      { logicalBlockId: null, clientBlockId: 'temporary-1', text: '保存快照' },
    ]);
    rememberPendingDraftSnapshot([snapshot('temporary-1', null, '保存快照')]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [persisted('server-1', '保存快照')]),
    ).toBe(true);
    expect(target.state().doc.firstChild?.textContent).toBe('保存快照');
    expect(target.state().doc.firstChild?.attrs).toMatchObject({
      logicalBlockId: 'server-1',
      clientBlockId: 'temporary-1',
      contentHash: 'hash-server-1',
    });
  });

  it('keeps later text, type, source and lock changes while attaching the persisted base identity', () => {
    const target = editorFor([
      {
        logicalBlockId: null,
        clientBlockId: 'temporary-1',
        text: '保存后继续输入',
        blockType: 'dialogue',
        source: 'mixed',
        locked: true,
      },
    ]);
    rememberPendingDraftSnapshot([snapshot('temporary-1', null, '保存快照')]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [persisted('server-1', '保存快照')]),
    ).toBe(true);
    expect(target.state().doc.firstChild?.type.name).toBe('dialogue');
    expect(target.state().doc.firstChild?.textContent).toBe('保存后继续输入');
    expect(target.state().doc.firstChild?.attrs).toMatchObject({
      logicalBlockId: 'server-1',
      clientBlockId: 'temporary-1',
      contentHash: 'hash-server-1',
      source: 'mixed',
      locked: true,
    });
  });

  it('updates an existing base hash without overwriting later semantic changes', () => {
    const target = editorFor([
      {
        logicalBlockId: 'server-1',
        clientBlockId: 'server-1',
        text: '保存期间改成对白',
        blockType: 'dialogue',
        source: 'mixed',
        locked: true,
      },
    ]);
    rememberPendingDraftSnapshot([snapshot('server-1', 'server-1', '旧段落')]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [persisted('server-1', '旧段落')]),
    ).toBe(true);
    expect(target.state().doc.firstChild?.type.name).toBe('dialogue');
    expect(target.state().doc.firstChild?.textContent).toBe('保存期间改成对白');
    expect(target.state().doc.firstChild?.attrs).toMatchObject({
      contentHash: 'hash-server-1',
      source: 'mixed',
      locked: true,
    });
  });

  it('partially synchronizes stable blocks after a split and leaves the new block for the next save', () => {
    const target = editorFor([
      { logicalBlockId: 'server-1', clientBlockId: 'server-1', text: '原段落前半' },
      { logicalBlockId: null, clientBlockId: 'split-1', text: '后半' },
    ]);
    rememberPendingDraftSnapshot([snapshot('server-1', 'server-1', '原段落')]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [persisted('server-1', '原段落')]),
    ).toBe(true);
    expect(target.state().doc.childCount).toBe(2);
    expect(target.state().doc.child(0).textContent).toBe('原段落前半');
    expect(target.state().doc.child(0).attrs.contentHash).toBe('hash-server-1');
    expect(target.state().doc.child(1).textContent).toBe('后半');
    expect(target.state().doc.child(1).attrs.logicalBlockId).toBeNull();
    expect(target.state().doc.child(1).attrs.clientBlockId).toBe('split-1');
  });

  it('maps reordered duplicate new text by clientBlockId instead of response position', () => {
    const target = editorFor([
      { logicalBlockId: null, clientBlockId: 'temporary-b', text: '相同' },
      { logicalBlockId: null, clientBlockId: 'temporary-a', text: '相同' },
    ]);
    rememberPendingDraftSnapshot([
      snapshot('temporary-a', null, '相同'),
      snapshot('temporary-b', null, '相同'),
    ]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [
        persisted('server-a', '相同', { source: 'ai', locked: true }),
        persisted('server-b', '相同', { source: 'mixed' }),
      ]),
    ).toBe(true);
    expect(target.state().doc.child(0).attrs).toMatchObject({
      clientBlockId: 'temporary-b',
      logicalBlockId: 'server-b',
      contentHash: 'hash-server-b',
      source: 'mixed',
      locked: false,
    });
    expect(target.state().doc.child(1).attrs).toMatchObject({
      clientBlockId: 'temporary-a',
      logicalBlockId: 'server-a',
      contentHash: 'hash-server-a',
      source: 'ai',
      locked: true,
    });
  });

  it('does not bind an unpersisted block when no matching save snapshot exists', () => {
    const target = editorFor([
      { logicalBlockId: null, clientBlockId: 'temporary-1', text: '没有保存快照' },
    ]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [persisted('server-1', '没有保存快照')]),
    ).toBe(true);
    expect(target.state().doc.firstChild?.attrs).toMatchObject({
      logicalBlockId: null,
      clientBlockId: 'temporary-1',
      contentHash: null,
    });
  });

  it('replaces an abandoned request snapshot with the next serialized save snapshot', () => {
    rememberPendingDraftSnapshot([snapshot('temporary-old', null, '旧请求')]);
    rememberPendingDraftSnapshot([snapshot('temporary-new', null, '新请求')]);

    const newest = editorFor([
      { logicalBlockId: null, clientBlockId: 'temporary-new', text: '新请求' },
    ]);
    synchronizePersistedBlockMetadata(newest.editor, [persisted('server-new', '新请求')]);
    expect(newest.state().doc.firstChild?.attrs.logicalBlockId).toBe('server-new');

    const stale = editorFor([
      { logicalBlockId: null, clientBlockId: 'temporary-old', text: '旧请求' },
    ]);
    synchronizePersistedBlockMetadata(stale.editor, [persisted('server-old', '旧请求')]);
    expect(stale.state().doc.firstChild?.attrs.logicalBlockId).toBeNull();
  });

  it('uses heading semantics to preserve later level changes while attaching persisted identity', () => {
    const target = editorFor([
      {
        logicalBlockId: null,
        clientBlockId: 'heading-1',
        text: '章节标题',
        blockType: 'heading',
        headingLevel: 4,
        source: 'mixed',
        locked: true,
      },
    ]);
    rememberPendingDraftSnapshot([
      snapshot('heading-1', null, '章节标题', {
        blockType: 'heading',
        attributes: { headingLevel: 3 },
      }),
    ]);

    synchronizePersistedBlockMetadata(target.editor, [
      persisted('server-heading', '章节标题', {
        blockType: 'heading',
        attributes: { headingLevel: 3 },
        source: 'ai',
        locked: false,
      }),
    ]);

    expect(target.state().doc.firstChild?.attrs).toMatchObject({
      logicalBlockId: 'server-heading',
      clientBlockId: 'heading-1',
      headingLevel: 4,
      source: 'mixed',
      locked: true,
      contentHash: 'hash-server-heading',
    });
  });

  it('synchronizes authoritative metadata when an existing heading is still unchanged', () => {
    const target = editorFor([
      {
        logicalBlockId: 'server-heading',
        clientBlockId: '',
        text: '章节标题',
        blockType: 'heading',
        headingLevel: 2,
      },
    ]);

    synchronizePersistedBlockMetadata(target.editor, [
      persisted('server-heading', '章节标题', {
        blockType: 'heading',
        attributes: { headingLevel: 2 },
        source: 'ai',
        locked: true,
      }),
    ]);

    expect(target.state().doc.firstChild?.attrs).toMatchObject({
      logicalBlockId: 'server-heading',
      clientBlockId: 'server-heading',
      headingLevel: 2,
      source: 'ai',
      locked: true,
      contentHash: 'hash-server-heading',
    });
  });

  it('rejects a snapshot whose prior logical identity does not match the persisted response', () => {
    const target = editorFor([
      { logicalBlockId: null, clientBlockId: 'temporary-1', text: '原文' },
    ]);
    rememberPendingDraftSnapshot([snapshot('temporary-1', 'different-server', '原文')]);

    synchronizePersistedBlockMetadata(target.editor, [persisted('server-1', '原文')]);
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBeNull();
  });

  it('rejects duplicate client identities before a patch can register an ambiguous snapshot', () => {
    expect(() =>
      buildDraftPatchOperations(
        [persisted('server-1', '原文')],
        [snapshot('duplicate', 'server-1', '原文'), snapshot('duplicate', null, '新增')],
      ),
    ).toThrow('Duplicate current clientBlockId: duplicate');
  });

  it('ignores duplicate persisted identities without touching current editor content', () => {
    const target = editorFor([
      { logicalBlockId: 'server-1', clientBlockId: 'server-1', text: '当前内容' },
    ]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [
        persisted('server-1', '旧内容'),
        persisted('server-1', '重复内容'),
      ]),
    ).toBe(true);
    expect(target.state().doc.firstChild?.textContent).toBe('当前内容');
    expect(target.state().doc.firstChild?.attrs.contentHash).toBe('old-server-1');
  });
});
