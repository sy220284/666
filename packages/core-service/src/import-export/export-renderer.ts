import type { TextDocumentFormat } from '@worldforge/contracts';

import { renderDocx } from '../docx-transfer.js';
import type { ExportBlockRow } from './import-export-model.js';

export function renderText(
  versions: readonly { readonly chapterTitle: string; readonly blocks: ExportBlockRow[] }[],
): string {
  return `${versions
    .map(
      (version) =>
        `=== ${version.chapterTitle} ===\n${version.blocks
          .map((block) => (block.blockType === 'separator' ? '***' : block.text))
          .join('\n\n')
          .trim()}`,
    )
    .join('\n\n')}\n`;
}

export function renderMarkdown(
  versions: readonly { readonly chapterTitle: string; readonly blocks: ExportBlockRow[] }[],
): string {
  return `${versions
    .map(
      (version) =>
        `# ${version.chapterTitle}\n\n${version.blocks
          .map((block) => {
            if (block.blockType === 'heading') return `## ${block.text}`;
            if (block.blockType === 'separator') return '---';
            return block.text;
          })
          .join('\n\n')
          .trim()}`,
    )
    .join('\n\n')}\n`;
}

export function renderExportContent(
  format: TextDocumentFormat,
  versions: readonly { readonly chapterTitle: string; readonly blocks: ExportBlockRow[] }[],
): Buffer {
  return format === 'docx'
    ? renderDocx(versions)
    : Buffer.from(format === 'markdown' ? renderMarkdown(versions) : renderText(versions), 'utf8');
}
