import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { stableCandidateSerialization } from '../../packages/core-service/src/candidate-integrity.js';
import { stable as stableDraft } from '../../packages/core-service/src/draft/draft-model.js';
import { stable as stableImport } from '../../packages/core-service/src/import-export/import-export-model.js';
import { stableJson } from '../../packages/core-service/src/stable-json.js';

const vector = {
  z: '中\n文',
  a: [3, { b: 2, a: 1 }],
  n: null,
};
const serialized = '{"a":[3,{"a":1,"b":2}],"n":null,"z":"中\\n文"}';

describe('stable JSON serialization', () => {
  it('preserves object ordering, array ordering and the existing golden hash', () => {
    expect(stableJson(vector)).toBe(serialized);
    expect(stableCandidateSerialization(vector)).toBe(serialized);
    expect(stableDraft(vector)).toBe(serialized);
    expect(stableImport(vector)).toBe(serialized);
    expect(createHash('sha256').update(serialized, 'utf8').digest('hex')).toBe(
      '75573b672f58ad0ef9d0fd76464175c681ff8b5576653709c0c1ea83d9df666d',
    );
  });

  it('keeps array order while sorting nested object keys', () => {
    expect(stableJson([{ y: 1, x: 2 }, { b: 3, a: 4 }])).toBe(
      '[{"x":2,"y":1},{"a":4,"b":3}]',
    );
  });
});
