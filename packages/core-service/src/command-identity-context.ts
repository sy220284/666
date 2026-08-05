import { AsyncLocalStorage } from 'node:async_hooks';

import { stableJson } from './stable-json.js';

interface CommandIdentityStore {
  readonly fingerprint: string;
}

const commandIdentityStorage = new AsyncLocalStorage<CommandIdentityStore>();

export function runWithCommandIdentity<T>(
  scope: string,
  input: unknown,
  operation: () => T,
): T {
  return commandIdentityStorage.run(
    { fingerprint: stableJson({ scope, input }) },
    operation,
  );
}

export function currentCommandFingerprint(fallback: string): string {
  return commandIdentityStorage.getStore()?.fingerprint ?? fallback;
}
