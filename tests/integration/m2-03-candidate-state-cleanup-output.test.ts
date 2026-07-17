import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

describe('M2-03 Candidate state cleanup output', () => {
  it('emits candidate-state without the unused CandidateSelection import', async () => {
    const path = 'packages/core-service/src/candidate-state.ts';
    const source = await readFile(path, 'utf8');
    const target = '  type CandidateSelection,\n';
    expect(source.split(target)).toHaveLength(2);
    const output = await format(source.replace(target, ''), { filepath: path });
    console.log(`M203_CANDIDATE_STATE_BASE64=${Buffer.from(output).toString('base64')}`);
  });
});
