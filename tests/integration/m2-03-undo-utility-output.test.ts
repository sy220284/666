import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

function replaceOnce(source: string, before: string, after: string): string {
  expect(source.split(before)).toHaveLength(2);
  return source.replace(before, after);
}

describe('M2-03 recovery Core routing output', () => {
  it('emits the exact Utility Process routing update', async () => {
    const path = 'packages/core-service/src/utility-entry.ts';
    let source = await readFile(path, 'utf8');
    source = replaceOnce(
      source,
      '  CANDIDATE_APPLY_COMMANDS,\n',
      '  CANDIDATE_APPLY_COMMANDS,\n  CANDIDATE_UNDO_LOOKUP_COMMAND,\n',
    );
    source = replaceOnce(
      source,
      "import { CandidateApplyService } from './candidate-apply.js';\n",
      "import { CandidateApplyService } from './candidate-apply.js';\nimport { CandidateRecordLocator } from './candidate-record-locator.js';\n",
    );
    source = replaceOnce(
      source,
      'const candidateApply = new CandidateApplyService(projectWorkspace);\n',
      'const candidateApply = new CandidateApplyService(projectWorkspace);\nconst candidateRecords = new CandidateRecordLocator(projectWorkspace);\n',
    );
    source = replaceOnce(
      source,
      `      case CANDIDATE_APPLY_COMMANDS.applyCandidate:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await candidateApply.apply(requestId, operation.input),\n        });\n`,
      `      case CANDIDATE_APPLY_COMMANDS.applyCandidate:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await candidateApply.apply(requestId, operation.input),\n        });\n      case CANDIDATE_UNDO_LOOKUP_COMMAND:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: candidateRecords.find(operation.input),\n        });\n      case CANDIDATE_APPLY_COMMANDS.previewUndo:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: candidateApply.previewUndo(operation.input),\n        });\n      case CANDIDATE_APPLY_COMMANDS.undoApply:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await candidateApply.undo(requestId, operation.input),\n        });\n`,
    );
    console.log(`M203_RECOVERY_UTILITY_BASE64=${Buffer.from(source).toString('base64')}`);
  });
});
