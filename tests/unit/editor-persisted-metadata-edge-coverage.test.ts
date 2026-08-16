import { describe, expect, it } from 'vitest';

import {
  EditorState,
  createWorldforgeEditorSchema,
  type DraftSnapshotEditorBlock,
  type PersistedEditorBlock,
} from '../../packages/editor-core/src/draft-document.js';
import { synchronizePersistedBlockMetadata } from '../../packages/editor-core/src/persisted-metadata-sync.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const schema = createWorldforgeEditorSchema();

type BlockType = DraftSnapshotEditorBlock['blockType'];

function snapshot(options: {
  clientBlockId: string;
  logicalBlockId?: string | null;
  blockType?: BlockType;
  text?: string;
  headingLevel?: unknown;
  locked?: boolean;
}): DraftSnapshotEditorBlock {
  return contractInput<DraftSnapshotEditorBlock>({
    clientBlockId: options.clientBlockId,
    logicalBlockId: options.logicalBlockId ?? null,
    blockType: options.blockType ?? 'paragraph',
    text: options.text ?? '正文',
    attributes:
      options.headingLevel === undefined ? {} : { headingLevel: options.headingLevel as number },
    locked: options.locked ?? false,
  });
}

function persisted(options: {
  logicalBlockId: string;
  clientBlockId?: string;
  blockType?: PersistedEditorBlock['blockType'];
  text?: string;
  headingLevel?: unknown;
  source?: string;
  locked?: boolean;
}): PersistedEditorBlock {
  return contractInput<PersistedEditorBlock>({
    logicalBlockId: options.logicalBlockId,
    ...(options.clientBlockId === undefined ? {} : { clientBlockId: options.clientBlockId }),
    blockType: options.blockType ?? 'paragraph',
    text: options.text ?? '正文',
    attributes:
      options.headingLevel === undefined ? {} : { headingLevel: options.headingLevel as number },
    source: options.source ?? 'manual',
    locked: options.locked ?? false,
    contentHash: `hash-${options.logicalBlockId}`,
  });
}

function editorFor(
  blocks: readonly {
    blockType?: BlockType;
    text?: string;
    logicalBlockId?: string | null;
    clientBlockId?: string | null;
    source?: string;
    locked?: boolean;
    contentHash?: string | null;
    headingLevel?: unknown;
  }[],
) {
  let state = EditorState.create({
    doc: schema.nodeFromJSON({
      type: 'chapterDocument',
      content: blocks.map((block) => ({
        type: block.blockType ?? 'paragraph',
        attrs: {
          logicalBlockId: block.logicalBlockId ?? null,
          clientBlockId: block.clientBlockId ?? null,
          source: block.source ?? 'manual',
          locked: block.locked ?? false,
          contentHash: block.contentHash ?? null,
          ...(block.blockType === 'heading'
            ? { headingLevel: block.headingLevel === undefined ? 2 : block.headingLevel }
            : {}),
        },
        content: block.text === '' ? undefined : [{ type: 'text', text: block.text ?? '正文' }],
      })),
    }),
  });
  const transactions: Array<Parameters<typeof state.apply>[0]> = [];
  return {
    editor: contractInput<Parameters<typeof synchronizePersistedBlockMetadata>[0]>({
      get state() {
        return state;
      },
      view: {
        dispatch(transaction: Parameters<typeof state.apply>[0]) {
          transactions.push(transaction);
          state = state.apply(transaction);
        },
      },
    }),
    state: () => state,
    transactions,
  };
}

describe('persisted metadata synchronization edge coverage', () => {
  it('fails closed for duplicate persisted identities and duplicate response client identities', () => {
    const target = editorFor([{ clientBlockId: 'client-a' }]);
    expect(
      synchronizePersistedBlockMetadata(
        target.editor,
        [persisted({ logicalBlockId: 'server-a' }), persisted({ logicalBlockId: 'server-a' })],
        [snapshot({ clientBlockId: 'client-a' })],
      ),
    ).toBe(false);

    expect(
      synchronizePersistedBlockMetadata(
        target.editor,
        [
          persisted({ logicalBlockId: 'server-a', clientBlockId: 'client-a' }),
          persisted({ logicalBlockId: 'server-b', clientBlockId: 'client-a' }),
        ],
        [snapshot({ clientBlockId: 'client-a' })],
      ),
    ).toBe(false);
    expect(target.transactions).toHaveLength(0);
  });

  it('rejects request mapping when block type, text or heading metadata no longer match', () => {
    const cases = [
      {
        server: persisted({
          logicalBlockId: 'server-a',
          clientBlockId: 'client-a',
          blockType: 'heading',
        }),
        request: snapshot({ clientBlockId: 'client-a', blockType: 'paragraph' }),
      },
      {
        server: persisted({
          logicalBlockId: 'server-a',
          clientBlockId: 'client-a',
          text: '另一段',
        }),
        request: snapshot({ clientBlockId: 'client-a', text: '正文' }),
      },
      {
        server: persisted({
          logicalBlockId: 'server-a',
          clientBlockId: 'client-a',
          blockType: 'heading',
          headingLevel: 3,
        }),
        request: snapshot({
          clientBlockId: 'client-a',
          blockType: 'heading',
          headingLevel: 2,
        }),
      },
    ];
    for (const { server, request } of cases) {
      const target = editorFor([
        {
          clientBlockId: 'client-a',
          blockType: request.blockType,
          headingLevel: request.attributes.headingLevel,
        },
      ]);
      expect(synchronizePersistedBlockMetadata(target.editor, [server], [request])).toBe(false);
    }
  });

  it('uses stable logical identity for already-persisted blocks and preserves valid heading metadata', () => {
    const target = editorFor([
      {
        blockType: 'heading',
        text: '标题',
        logicalBlockId: 'server-heading',
        clientBlockId: null,
        headingLevel: 4,
        source: 'manual',
        locked: false,
        contentHash: 'old-hash',
      },
    ]);
    expect(
      synchronizePersistedBlockMetadata(
        target.editor,
        [
          persisted({
            logicalBlockId: 'server-heading',
            blockType: 'heading',
            text: '标题',
            headingLevel: 4,
            source: 'ai',
            locked: true,
          }),
        ],
        [
          snapshot({
            clientBlockId: 'request-heading',
            logicalBlockId: 'server-heading',
            blockType: 'heading',
            text: '标题',
            headingLevel: 4,
          }),
        ],
      ),
    ).toBe(true);
    const attrs = target.state().doc.firstChild!.attrs;
    expect(attrs).toMatchObject({
      logicalBlockId: 'server-heading',
      clientBlockId: 'server-heading',
      source: 'ai',
      locked: true,
      contentHash: 'hash-server-heading',
      headingLevel: 4,
    });
    expect(target.transactions[0]?.getMeta('addToHistory')).toBe(false);
    expect(target.transactions[0]?.getMeta('worldforgeLockCommand')).toBe(true);
  });

  it('falls back invalid heading levels to level two across snapshot, persisted and current nodes', () => {
    const request = snapshot({
      clientBlockId: 'client-heading',
      blockType: 'heading',
      text: '标题',
      headingLevel: 99,
    });
    const target = editorFor([
      {
        clientBlockId: 'client-heading',
        blockType: 'heading',
        text: '标题',
        headingLevel: 0,
      },
    ]);
    expect(
      synchronizePersistedBlockMetadata(
        target.editor,
        [
          persisted({
            logicalBlockId: 'server-heading',
            clientBlockId: 'client-heading',
            blockType: 'heading',
            text: '标题',
            headingLevel: Number.NaN,
          }),
        ],
        [request],
      ),
    ).toBe(true);
    expect(target.state().doc.firstChild?.attrs.headingLevel).toBe(2);
  });

  it('does not overwrite current source or lock when text changed after the saved snapshot', () => {
    const target = editorFor([
      {
        clientBlockId: 'client-a',
        text: '保存后继续输入',
        source: 'manual',
        locked: true,
      },
    ]);
    expect(
      synchronizePersistedBlockMetadata(
        target.editor,
        [
          persisted({
            logicalBlockId: 'server-a',
            clientBlockId: 'client-a',
            text: '保存快照',
            source: 'ai',
            locked: false,
          }),
        ],
        [snapshot({ clientBlockId: 'client-a', text: '保存快照' })],
      ),
    ).toBe(true);
    expect(target.state().doc.firstChild?.attrs).toMatchObject({
      logicalBlockId: 'server-a',
      clientBlockId: 'client-a',
      source: 'manual',
      locked: true,
      contentHash: 'hash-server-a',
    });
  });

  it('rejects conflicting client and stable identities and never reuses one persisted id twice', () => {
    const conflict = editorFor([
      {
        clientBlockId: 'client-a',
        logicalBlockId: 'server-b',
        text: '正文',
      },
    ]);
    expect(
      synchronizePersistedBlockMetadata(
        conflict.editor,
        [
          persisted({ logicalBlockId: 'server-a', clientBlockId: 'client-a' }),
          persisted({ logicalBlockId: 'server-b' }),
        ],
        [snapshot({ clientBlockId: 'client-a' })],
      ),
    ).toBe(false);

    const duplicateCurrent = editorFor([
      { logicalBlockId: 'server-a', clientBlockId: null, text: '正文' },
      { logicalBlockId: 'server-a', clientBlockId: null, text: '正文' },
    ]);
    expect(
      synchronizePersistedBlockMetadata(
        duplicateCurrent.editor,
        [persisted({ logicalBlockId: 'server-a' })],
        [],
      ),
    ).toBe(true);
    expect(duplicateCurrent.state().doc.child(0).attrs.contentHash).toBe('hash-server-a');
    expect(duplicateCurrent.state().doc.child(1).attrs.contentHash).toBeNull();
  });

  it('requires current stable nodes to match persisted type, text and heading level before applying source metadata', () => {
    for (const current of [
      { blockType: 'heading' as const, text: '正文', headingLevel: 2 },
      { blockType: 'paragraph' as const, text: '变化正文' },
      { blockType: 'heading' as const, text: '标题', headingLevel: 3 },
    ]) {
      const server =
        current.blockType === 'heading'
          ? persisted({
              logicalBlockId: 'server-a',
              blockType: current.text === '标题' ? 'heading' : 'paragraph',
              text: current.text,
              headingLevel: 2,
              source: 'ai',
              locked: true,
            })
          : persisted({
              logicalBlockId: 'server-a',
              blockType: 'paragraph',
              text: '旧正文',
              source: 'ai',
              locked: true,
            });
      const target = editorFor([
        {
          logicalBlockId: 'server-a',
          clientBlockId: null,
          ...current,
          source: 'manual',
          locked: false,
        },
      ]);
      expect(synchronizePersistedBlockMetadata(target.editor, [server], [])).toBe(true);
      expect(target.state().doc.firstChild?.attrs).toMatchObject({
        source: 'manual',
        locked: false,
        contentHash: 'hash-server-a',
      });
    }
  });
});
