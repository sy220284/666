import { describe, expect, it } from 'vitest';

import { mainVerificationStatusPayload } from '../../scripts/main-verification.mjs';

describe('主分支验证状态发布', () => {
  it('只发布稳定的main-verification状态，不要求任务授权或任务状态', () => {
    expect(mainVerificationStatusPayload(true, 'https://example.test')).toEqual({
      state: 'success',
      context: 'main-verification',
      description: 'Final main SHA passed provenance and static verification',
      target_url: 'https://example.test',
    });
    expect(mainVerificationStatusPayload(false, 'https://example.test').state).toBe('failure');
  });
});
