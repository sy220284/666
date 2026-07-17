import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

function replaceOnce(source: string, before: string, after: string): string {
  expect(source.split(before)).toHaveLength(2);
  return source.replace(before, after);
}

describe('M2-03 Preview Preload output', () => {
  it('emits the typed Preview bridge without generic IPC access', async () => {
    const path = 'apps/desktop/preload/src/index.ts';
    let source = await readFile(path, 'utf8');
    source = replaceOnce(
      source,
      '  CANDIDATE_COMMANDS,\n  CANDIDATE_IPC_CHANNELS,',
      '  CANDIDATE_COMMANDS,\n  CANDIDATE_IPC_CHANNELS,\n  CANDIDATE_APPLY_COMMANDS,\n  CANDIDATE_APPLY_IPC_CHANNELS,',
    );
    source = replaceOnce(
      source,
      '  CandidateListResultSchema,\n  CandidateSummaryResultSchema,',
      '  CandidateListResultSchema,\n  CandidatePreviewCommandSchema,\n  CandidatePreviewResultSchema,\n  CandidateSummaryResultSchema,',
    );
    source = replaceOnce(
      source,
      '  type CandidateList,\n  type CandidateSummary,',
      '  type CandidateList,\n  type CandidatePreview,\n  type CandidatePreviewInput,\n  type CandidateSummary,',
    );
    source = replaceOnce(
      source,
      '    readonly discard: (input: CandidateDiscardInput) => Promise<CommandResult<CandidateSummary>>;\n',
      '    readonly discard: (input: CandidateDiscardInput) => Promise<CommandResult<CandidateSummary>>;\n    readonly preview: (input: CandidatePreviewInput) => Promise<CommandResult<CandidatePreview>>;\n',
    );
    source = replaceOnce(
      source,
      `    discard: (input) =>
      invoke(
        CANDIDATE_IPC_CHANNELS.discardCandidate,
        CandidateDiscardCommandSchema.parse(envelope(CANDIDATE_COMMANDS.discardCandidate, input)),
        CandidateSummaryResultSchema,
      ),
  },`,
      `    discard: (input) =>
      invoke(
        CANDIDATE_IPC_CHANNELS.discardCandidate,
        CandidateDiscardCommandSchema.parse(envelope(CANDIDATE_COMMANDS.discardCandidate, input)),
        CandidateSummaryResultSchema,
      ),
    preview: (input) =>
      invoke(
        CANDIDATE_APPLY_IPC_CHANNELS.previewCandidate,
        CandidatePreviewCommandSchema.parse(
          envelope(CANDIDATE_APPLY_COMMANDS.previewCandidate, input),
        ),
        CandidatePreviewResultSchema,
      ),
  },`,
    );
    const output = await format(source, {
      filepath: path,
      printWidth: 100,
      singleQuote: true,
      trailingComma: 'all',
    });
    console.log(`M203_PREVIEW_PRELOAD_BASE64=${Buffer.from(output).toString('base64')}`);
  });
});
