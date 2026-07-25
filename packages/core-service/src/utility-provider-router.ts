import {
  CoreProviderResultSchema,
  PROVIDER_CORE_OPERATIONS,
  type CoreProviderOperation,
  type CoreProviderResult,
} from '@worldforge/contracts';

import type { AppRuntime } from './app-runtime.js';
import { providerErrorCode } from './provider-errors.js';
import { summarizeProviderConfig } from './provider-connection.js';

export async function executeProviderOperation(
  appRuntime: AppRuntime,
  requestId: string,
  operation: CoreProviderOperation,
): Promise<CoreProviderResult> {
  try {
    switch (operation.operation) {
      case PROVIDER_CORE_OPERATIONS.list:
        return CoreProviderResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: { providers: appRuntime.providerConfigs.list().map(summarizeProviderConfig) },
        });
      case PROVIDER_CORE_OPERATIONS.get:
        return CoreProviderResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: { provider: appRuntime.providerConfigs.get(operation.providerId) },
        });
      case PROVIDER_CORE_OPERATIONS.upsert: {
        validateForPersistence(operation.config.baseUrl);
        const saved = await appRuntime.providerConfigs.upsert(requestId, operation.config);
        return CoreProviderResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: summarizeProviderConfig(saved),
        });
      }
      case PROVIDER_CORE_OPERATIONS.remove:
        return CoreProviderResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: {
            removed: await appRuntime.providerConfigs.remove(requestId, operation.providerId),
          },
        });
      case PROVIDER_CORE_OPERATIONS.testConnection:
        return CoreProviderResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await appRuntime.providerConnections.test(operation.config, operation.credential),
        });
    }
  } catch (error) {
    return CoreProviderResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: providerErrorCode(error),
    });
  }
}

function validateForPersistence(baseUrl: string): void {
  summarizeProviderConfig({
    id: 'validation',
    name: 'validation',
    protocol: 'openai_compatible',
    baseUrl,
    model: 'validation',
    credentialRef: null,
    timeoutMs: 1_000,
    options: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}
