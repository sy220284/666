import type { ProviderConfig } from '@worldforge/contracts';

import {
  createProviderAdapter as createBaseProviderAdapter,
  type AIProvider,
  type ProviderAdapterDependencies,
} from './provider-adapters.js';
import { ProviderRuntimeError } from './provider-errors.js';

export const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024 * 1024;
export const MAX_PROVIDER_SSE_EVENT_BYTES = 1024 * 1024;

function responseTooLarge(): ProviderRuntimeError {
  return new ProviderRuntimeError(
    'AI_RESPONSE_TOO_LARGE_014',
    'The Provider response exceeded the configured safety limit.',
    false,
  );
}

function parsedContentLength(response: Response): number | null {
  const value = response.headers.get('content-length');
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isEventStream(response: Response): boolean {
  return (
    response.headers
      .get('content-type')
      ?.toLocaleLowerCase('en-US')
      .startsWith('text/event-stream') === true
  );
}

export function createBoundedProviderFetch(
  implementation: typeof fetch,
  maximumBytes = MAX_PROVIDER_RESPONSE_BYTES,
  maximumSseEventBytes = MAX_PROVIDER_SSE_EVENT_BYTES,
): typeof fetch {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('PROVIDER_RESPONSE_LIMIT_INVALID');
  }
  if (!Number.isSafeInteger(maximumSseEventBytes) || maximumSseEventBytes < 1) {
    throw new Error('PROVIDER_SSE_EVENT_LIMIT_INVALID');
  }

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const response = await implementation(input, init);
    const declaredLength = parsedContentLength(response);
    if (declaredLength !== null && declaredLength > maximumBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw responseTooLarge();
    }
    if (!response.body) return response;

    const reader = response.body.getReader();
    const eventStream = isEventStream(response);
    let receivedBytes = 0;
    let eventBytes = 0;
    let lineHasContent = false;
    let previousWasCarriageReturn = false;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            controller.close();
            return;
          }
          receivedBytes += chunk.value.byteLength;
          if (receivedBytes > maximumBytes) {
            await reader.cancel().catch(() => undefined);
            controller.error(responseTooLarge());
            return;
          }
          if (eventStream) {
            for (const byte of chunk.value) {
              eventBytes += 1;
              if (byte === 13) {
                if (!lineHasContent) eventBytes = 0;
                lineHasContent = false;
                previousWasCarriageReturn = true;
              } else if (byte === 10) {
                if (previousWasCarriageReturn) {
                  previousWasCarriageReturn = false;
                } else {
                  if (!lineHasContent) eventBytes = 0;
                  lineHasContent = false;
                }
              } else {
                previousWasCarriageReturn = false;
                lineHasContent = true;
              }
              if (eventBytes > maximumSseEventBytes) {
                await reader.cancel().catch(() => undefined);
                controller.error(responseTooLarge());
                return;
              }
            }
          }
          controller.enqueue(chunk.value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

/** Public adapter factory. All production callers receive a bounded response stream. */
export function createProviderAdapter(
  config: ProviderConfig,
  credential: string | null,
  dependencies: ProviderAdapterDependencies = {},
): AIProvider {
  const implementation = dependencies.fetch ?? globalThis.fetch;
  return createBaseProviderAdapter(config, credential, {
    ...dependencies,
    fetch: createBoundedProviderFetch(implementation),
  });
}
