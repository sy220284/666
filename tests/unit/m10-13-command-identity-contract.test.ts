import { describe, expect, it } from 'vitest';

import {
  CommandIdentityRequiredError,
  currentCommandFingerprint,
  requireCommandFingerprint,
  runWithCommandIdentity,
  runWithoutCommandIdentity,
} from '../../packages/core-service/src/command-identity-context.js';

describe('M10-13 command identity contract', () => {
  it('propagates one stable command fingerprint through nested writes', () => {
    runWithCommandIdentity('core.project.command', { operation: 'project.write', value: 1 }, () => {
      const outer = requireCommandFingerprint();
      expect(currentCommandFingerprint()).toBe(outer);
      expect(requireCommandFingerprint()).toBe(outer);
    });
  });

  it('fails explicitly outside a command boundary', () => {
    runWithoutCommandIdentity(() => {
      expect(currentCommandFingerprint()).toBeNull();
      expect(() => requireCommandFingerprint()).toThrow(CommandIdentityRequiredError);
    });
  });
});
