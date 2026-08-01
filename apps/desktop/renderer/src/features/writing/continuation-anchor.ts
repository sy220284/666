import type { ProjectContinuationSnapshot } from '@worldforge/contracts';
import type { Editor } from '@worldforge/editor-core';

export interface ContinuationAnchor {
  readonly logicalBlockId: string;
  readonly expectedBlockHash: string;
  readonly cursorOffset: number;
}

export function captureContinuationAnchor(instance: Editor): ContinuationAnchor | null {
  const position = instance.state.selection.$from;
  for (let depth = position.depth; depth >= 1; depth -= 1) {
    const node = position.node(depth);
    const attributes = node.attrs as Record<string, unknown>;
    if (
      typeof attributes.logicalBlockId === 'string' &&
      typeof attributes.contentHash === 'string'
    ) {
      return {
        logicalBlockId: attributes.logicalBlockId,
        expectedBlockHash: attributes.contentHash,
        cursorOffset: Math.max(0, position.pos - position.start(depth)),
      };
    }
  }
  return null;
}

export function continuationCursorPosition(
  blockPosition: number,
  cursorOffset: number,
  contentSize: number,
): number {
  return blockPosition + 1 + Math.min(Math.max(0, cursorOffset), Math.max(0, contentSize));
}

export function restoreContinuationAnchor(
  instance: Editor,
  continuation: ProjectContinuationSnapshot,
): void {
  if (continuation.status !== 'ready') return;
  let target: number | null = null;
  instance.state.doc.descendants((node, position) => {
    if (target !== null) return false;
    const attributes = node.attrs as Record<string, unknown>;
    if (attributes.logicalBlockId !== continuation.logicalBlockId) return true;
    target = continuationCursorPosition(position, continuation.cursorOffset, node.content.size);
    return false;
  });
  if (target !== null) {
    instance.commands.setTextSelection(target);
    instance.commands.focus();
  }
}
