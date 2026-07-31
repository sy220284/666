import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = path.join(process.cwd(), 'packages/core-service/src/draft.ts');
const source = await readFile(target, 'utf8');
const before = `      this.#faultInjector?.('after-patch-persist');
      return readDocument(connection, valid.projectId, valid.chapterId, {
        ...draft,
        revision: committedRevision,
      });`;
const after = `      this.#faultInjector?.('after-patch-persist');
      const document = readDocument(connection, valid.projectId, valid.chapterId, {
        ...draft,
        revision: committedRevision,
      });
      const clientIdentityByLogicalId = new Map(
        after.flatMap((block) =>
          block.clientBlockId ? [[block.logicalBlockId, block.clientBlockId] as const] : [],
        ),
      );
      return {
        ...document,
        blocks: document.blocks.map((block) => {
          const clientBlockId = clientIdentityByLogicalId.get(block.logicalBlockId);
          return clientBlockId ? { ...block, clientBlockId } : block;
        }),
      };`;
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`expected one response return match, found ${count}`);
await writeFile(target, source.replace(before, after));
