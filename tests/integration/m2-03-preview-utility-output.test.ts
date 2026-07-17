import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

function replaceOnce(source: string, before: string, after: string): string {
  expect(source.split(before)).toHaveLength(2);
  return source.replace(before, after);
}

describe('M2-03 Preview Utility routing output', () => {
  it('emits the Utility Process with Preview-only routing', async () => {
    const path = 'packages/core-service/src/utility-entry.ts';
    let source = await readFile(path, 'utf8');
    source = replaceOnce(
      source,
      '  CANDIDATE_COMMANDS,\n  VERSION_COMMANDS,',
      '  CANDIDATE_COMMANDS,\n  CANDIDATE_APPLY_COMMANDS,\n  VERSION_COMMANDS,',
    );
    source = replaceOnce(
      source,
      "import { CandidateService, CandidateServiceError } from './candidate.js';",
      "import { CandidateApplyService } from './candidate-apply.js';\nimport { CandidateApplyServiceError } from './candidate-state.js';\nimport { CandidateService, CandidateServiceError } from './candidate.js';",
    );
    source = replaceOnce(
      source,
      'const candidates = new CandidateService(projectWorkspace);\nconst versions =',
      'const candidates = new CandidateService(projectWorkspace);\nconst candidateApply = new CandidateApplyService(projectWorkspace);\nconst versions =',
    );
    source = replaceOnce(
      source,
      '  if (error instanceof CandidateServiceError) {',
      `  if (error instanceof CandidateApplyServiceError) {
    if (error.code === 'CANDIDATE_APPLY_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'CANDIDATE_APPLY_INVALID') return 'COMMON_INVALID_INPUT_001';
    return 'COMMON_CONFLICT_003';
  }
  if (error instanceof CandidateServiceError) {`,
    );
    source = replaceOnce(
      source,
      `      case CANDIDATE_COMMANDS.discardCandidate:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await candidates.discard(requestId, operation.input),
        });
      case VERSION_COMMANDS.createVersion:`,
      `      case CANDIDATE_COMMANDS.discardCandidate:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await candidates.discard(requestId, operation.input),
        });
      case CANDIDATE_APPLY_COMMANDS.previewCandidate:
        return CoreProjectResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: candidateApply.preview(operation.input),
        });
      case VERSION_COMMANDS.createVersion:`,
    );
    const output = await format(source, {
      filepath: path,
      printWidth: 100,
      singleQuote: true,
      trailingComma: 'all',
    });
    console.log(`M203_PREVIEW_UTILITY_BASE64=${Buffer.from(output).toString('base64')}`);
  });
});
