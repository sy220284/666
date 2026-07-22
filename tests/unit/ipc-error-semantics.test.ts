import { describe, expect, it } from 'vitest';

import { coreOperationFailureSemantics } from '../../apps/desktop/main/src/ipc-error-semantics.js';

describe('Core operation IPC failure semantics', () => {
  it('marks Core timeout results as unknown and not directly retryable', () => {
    expect(coreOperationFailureSemantics('COMMON_TIMEOUT_005', 'fallback')).toEqual({
      message:
        'Core did not return a final result before the timeout; the operation may still have completed.',
      retryable: false,
      userAction: 'Refresh authoritative state before attempting the operation again.',
    });
  });

  it('retains retryability for transient internal and database busy failures', () => {
    expect(coreOperationFailureSemantics('DB_BUSY_TIMEOUT_002', 'busy')).toEqual({
      message: 'busy',
      retryable: true,
    });
  });
});
