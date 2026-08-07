import { AsyncLocalStorage } from 'node:async_hooks';

import { stableJson } from './stable-json.js';

interface CommandIdentityStore {
  readonly fingerprint: string;
}

const commandIdentityStorage = new AsyncLocalStorage<CommandIdentityStore>();

export class CommandIdentityRequiredError extends Error {
  constructor() {
    super('A stable command identity is required for product database writes.');
    this.name = 'CommandIdentityRequiredError';
  }
}

function commandIdentity(scope: string, input: unknown): CommandIdentityStore {
  return { fingerprint: stableJson({ scope, input }) };
}

export function runWithCommandIdentity<T>(scope: string, input: unknown, operation: () => T): T {
  return commandIdentityStorage.run(commandIdentity(scope, input), operation);
}

export function enterCommandIdentity(scope: string, input: unknown): void {
  commandIdentityStorage.enterWith(commandIdentity(scope, input));
}

export function runWithoutCommandIdentity<T>(operation: () => T): T {
  return commandIdentityStorage.exit(operation);
}

export function currentCommandFingerprint(): string | null {
  return commandIdentityStorage.getStore()?.fingerprint ?? null;
}

export function requireCommandFingerprint(): string {
  const fingerprint = currentCommandFingerprint();
  if (fingerprint) return fingerprint;
  throw new CommandIdentityRequiredError();
}
