import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function replaceExact(relative, before, after) {
  const target = path.join(root, relative);
  const source = await readFile(target, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${relative}: expected one match, found ${count}`);
  await writeFile(target, source.replace(before, after));
}

await replaceExact(
  'packages/contracts/src/draft.ts',
  `  .strictObject({
    logicalBlockId: DraftEntityIdSchema,
    orderKey: DraftOrderKeySchema,`,
  `  .strictObject({
    logicalBlockId: DraftEntityIdSchema,
    clientBlockId: DraftClientBlockIdSchema.optional(),
    orderKey: DraftOrderKeySchema,`,
);
await replaceExact(
  'packages/contracts/src/draft.ts',
  `export const DraftPatchInsertOperationSchema = z.strictObject({
  type: z.literal('insert'),
  afterLogicalBlockId: DraftEntityIdSchema.nullable(),`,
  `export const DraftPatchInsertOperationSchema = z.strictObject({
  type: z.literal('insert'),
  clientBlockId: DraftClientBlockIdSchema.optional(),
  afterLogicalBlockId: DraftEntityIdSchema.nullable(),`,
);

await replaceExact(
  'packages/editor-core/src/draft-document.ts',
  `export interface PersistedEditorBlock {
  readonly logicalBlockId: string;
  readonly blockType: WorldforgeBlockType;`,
  `export interface PersistedEditorBlock {
  readonly logicalBlockId: string;
  readonly clientBlockId?: string | null | undefined;
  readonly blockType: WorldforgeBlockType;`,
);

await replaceExact(
  'packages/editor-core/src/draft-patch.ts',
  `  | {
      readonly type: 'insert';
      readonly afterLogicalBlockId: string | null;`,
  `  | {
      readonly type: 'insert';
      readonly clientBlockId: string;
      readonly afterLogicalBlockId: string | null;`,
);
await replaceExact(
  'packages/editor-core/src/draft-patch.ts',
  `    inserts.push({
      type: 'insert',
      afterLogicalBlockId,`,
  `    inserts.push({
      type: 'insert',
      clientBlockId: block.clientBlockId,
      afterLogicalBlockId,`,
);

await replaceExact(
  'packages/core-service/src/draft.ts',
  `interface WorkingBlock {
  readonly recordId: string;
  readonly logicalBlockId: string;
  readonly blockType: DraftBlock['blockType'];`,
  `interface WorkingBlock {
  readonly recordId: string;
  readonly logicalBlockId: string;
  readonly clientBlockId?: string | undefined;
  readonly blockType: DraftBlock['blockType'];`,
);
await replaceExact(
  'packages/core-service/src/draft.ts',
  `  const blocks = readWorkingBlocks(connection, draft.id).map((block, index) => ({
    logicalBlockId: block.logicalBlockId,
    orderKey: String((index + 1) * 1024),`,
  `  const blocks = readWorkingBlocks(connection, draft.id).map((block, index) => ({
    logicalBlockId: block.logicalBlockId,
    ...(block.clientBlockId ? { clientBlockId: block.clientBlockId } : {}),
    orderKey: String((index + 1) * 1024),`,
);
await replaceExact(
  'packages/core-service/src/draft.ts',
  `      const parsed = DraftBlockSchema.parse({
        logicalBlockId: block.logicalBlockId,
        orderKey: block.orderKey,`,
  `      const parsed = DraftBlockSchema.parse({
        logicalBlockId: block.logicalBlockId,
        clientBlockId: block.clientBlockId,
        orderKey: block.orderKey,`,
);
await replaceExact(
  'packages/core-service/src/draft.ts',
  `  return blocks.map((block, index) => ({
    logicalBlockId: block.logicalBlockId,
    orderKey: String((index + 1) * 1024),`,
  `  return blocks.map((block, index) => ({
    logicalBlockId: block.logicalBlockId,
    ...(block.clientBlockId ? { clientBlockId: block.clientBlockId } : {}),
    orderKey: String((index + 1) * 1024),`,
);
await replaceExact(
  'packages/core-service/src/draft.ts',
  `      blocks.splice(index, 0, {
        recordId: idFactory(),
        logicalBlockId: idFactory(),
        ...normalized,`,
  `      blocks.splice(index, 0, {
        recordId: idFactory(),
        logicalBlockId: idFactory(),
        ...(operation.clientBlockId ? { clientBlockId: operation.clientBlockId } : {}),
        ...normalized,`,
);

await replaceExact(
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
  `      document.blocks.map((block) => ({
        logicalBlockId: block.logicalBlockId,
        blockType: block.blockType,`,
  `      document.blocks.map((block) => ({
        logicalBlockId: block.logicalBlockId,
        clientBlockId: block.clientBlockId ?? null,
        blockType: block.blockType,`,
);

await replaceExact(
  'packages/editor-core/src/persisted-metadata-sync.ts',
  `function requestMapping(
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
}`,
  `function requestMapping(
  blocks: readonly PersistedEditorBlock[],
  requestSnapshot: readonly DraftSnapshotEditorBlock[],
): ReadonlyMap<string, PersistedEditorBlock> | null {
  const responseByClientId = new Map<string, PersistedEditorBlock>();
  for (const block of blocks) {
    const clientBlockId = optionalString(block.clientBlockId);
    if (!clientBlockId) continue;
    if (responseByClientId.has(clientBlockId)) return null;
    responseByClientId.set(clientBlockId, block);
  }

  const mapped = new Map<string, PersistedEditorBlock>();
  for (const savedBlock of requestSnapshot) {
    if (savedBlock.logicalBlockId) continue;
    const persisted = responseByClientId.get(savedBlock.clientBlockId);
    if (!persisted || !snapshotMatchesPersisted(savedBlock, persisted)) return null;
    mapped.set(savedBlock.clientBlockId, persisted);
  }
  return mapped;
}`,
);

await replaceExact(
  'tests/unit/editor-draft-patch.test.ts',
  `      {
        type: 'insert',
        afterLogicalBlockId: firstId,
        block: { blockType: 'paragraph', content: '新二', attributes: {} },
      },
      {
        type: 'insert',
        afterLogicalBlockId: firstId,
        block: { blockType: 'paragraph', content: '新一', attributes: {} },
      },`,
  `      {
        type: 'insert',
        clientBlockId: 'temporary-two',
        afterLogicalBlockId: firstId,
        block: { blockType: 'paragraph', content: '新二', attributes: {} },
      },
      {
        type: 'insert',
        clientBlockId: 'temporary-one',
        afterLogicalBlockId: firstId,
        block: { blockType: 'paragraph', content: '新一', attributes: {} },
      },`,
);

await replaceExact(
  'tests/unit/editor-persisted-metadata-sync.test.ts',
  `function persisted(logicalBlockId: string, text: string): PersistedEditorBlock {
  return {
    logicalBlockId,
    blockType: 'paragraph',`,
  `function persisted(
  logicalBlockId: string,
  text: string,
  clientBlockId?: string,
): PersistedEditorBlock {
  return {
    logicalBlockId,
    ...(clientBlockId ? { clientBlockId } : {}),
    blockType: 'paragraph',`,
);
await replaceExact(
  'tests/unit/editor-persisted-metadata-sync.test.ts',
  `[persisted('server-a', '相同'), persisted('server-b', '相同')]`,
  `[persisted('server-a', '相同', 'client-a'), persisted('server-b', '相同', 'client-b')]`,
);
await replaceExact(
  'tests/unit/editor-persisted-metadata-sync.test.ts',
  `[persisted('server-a', '保存快照')]`,
  `[persisted('server-a', '保存快照', 'client-a')]`,
);
await replaceExact(
  'tests/unit/editor-persisted-metadata-sync.test.ts',
  `[persisted('server-old', '旧请求')]`,
  `[persisted('server-old', '旧请求', 'client-old')]`,
);
await replaceExact(
  'tests/unit/editor-persisted-metadata-sync.test.ts',
  `[persisted('server-a', '粘贴正文')]`,
  `[persisted('server-a', '粘贴正文', 'request-client')]`,
);

await replaceExact(
  'tests/unit/editor-persisted-metadata-isolation.test.ts',
  `const persisted = (logicalBlockId: string, text: string): PersistedEditorBlock => ({
  logicalBlockId,
  blockType: 'paragraph',`,
  `const persisted = (
  logicalBlockId: string,
  text: string,
  clientBlockId: string,
): PersistedEditorBlock => ({
  logicalBlockId,
  clientBlockId,
  blockType: 'paragraph',`,
);
await replaceExact(
  'tests/unit/editor-persisted-metadata-isolation.test.ts',
  `[persisted('server-a', '相同正文')]`,
  `[persisted('server-a', '相同正文', 'chapter-a')]`,
);
await replaceExact(
  'tests/unit/editor-persisted-metadata-isolation.test.ts',
  `[persisted('server-b', '相同正文')]`,
  `[persisted('server-b', '相同正文', 'chapter-b')]`,
);

await replaceExact(
  'tests/integration/draft-patch.test.ts',
  `          {
            type: 'insert',
            afterLogicalBlockId: first.logicalBlockId,
            block: { blockType: 'dialogue', content: '“新块。”', attributes: {} },
          },`,
  `          {
            type: 'insert',
            clientBlockId: 'integration-new-dialogue',
            afterLogicalBlockId: first.logicalBlockId,
            block: { blockType: 'dialogue', content: '“新块。”', attributes: {} },
          },`,
);
await replaceExact(
  'tests/integration/draft-patch.test.ts',
  `      expect(firstBatch.blocks.every((block) => block.contentHash !== null)).toBe(true);

      const moved = firstBatch.blocks[1]!;`,
  `      expect(firstBatch.blocks.every((block) => block.contentHash !== null)).toBe(true);
      expect(firstBatch.blocks[1]?.clientBlockId).toBe('integration-new-dialogue');

      const moved = firstBatch.blocks[1]!;`,
);
