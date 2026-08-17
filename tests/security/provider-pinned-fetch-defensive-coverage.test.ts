import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProviderEndpointBinding } from '../../packages/core-service/src/provider-endpoint.js';

type RequestSocket = {
  connecting: boolean;
  once(event: string, listener: () => void): void;
};

type RequestEventValue = RequestSocket | Error;

type RequestFactory = (
  options: Record<string, unknown>,
  callback: (
    response: Readable & {
      statusCode?: number;
      statusMessage?: string;
      headers: Record<string, string | string[] | undefined>;
      resume(): Readable;
    },
  ) => void,
) => {
  once(event: string, listener: (value: RequestEventValue) => void): unknown;
  end(body?: unknown): void;
};

function binding(origin: string, hostname: string): ProviderEndpointBinding {
  return {
    endpoint: {
      scope: origin.startsWith('https:') ? 'external' : 'lan',
      origin,
      secureTransport: origin.startsWith('https:'),
      warnings: [],
    },
    hostname,
    addresses: [{ address: '127.0.0.1', family: 4 }],
  };
}

async function loadWithRequests(httpRequest: RequestFactory, httpsRequest: RequestFactory) {
  vi.resetModules();
  vi.doMock('node:http', () => ({ request: httpRequest }));
  vi.doMock('node:https', () => ({ request: httpsRequest }));
  return import('../../packages/core-service/src/provider-pinned-fetch.js');
}

function response(options: {
  body?: string;
  statusCode?: number;
  statusMessage?: string;
  headers?: Record<string, string | string[] | undefined>;
}) {
  const stream = Readable.from(options.body ? [Buffer.from(options.body)] : []);
  Object.assign(stream, {
    statusCode: options.statusCode,
    statusMessage: options.statusMessage,
    headers: options.headers ?? {},
  });
  return stream as ReturnType<Parameters<RequestFactory>[1]> extends never
    ? never
    : Readable & {
        statusCode?: number;
        statusMessage?: string;
        headers: Record<string, string | string[] | undefined>;
        resume(): Readable;
      };
}

function successfulRequest(config: {
  response: ReturnType<typeof response>;
  connecting: boolean;
  expectedSocketEvent?: 'connect' | 'secureConnect';
}): RequestFactory {
  return (_options, callback) => {
    let socketListener: ((value: RequestEventValue) => void) | undefined;
    return {
      once(event, listener) {
        if (event === 'socket') socketListener = listener;
        return this;
      },
      end() {
        const socket: RequestSocket = {
          connecting: config.connecting,
          once: (event: string, listener: () => void) => {
            if (config.expectedSocketEvent) expect(event).toBe(config.expectedSocketEvent);
            listener();
          },
        };
        socketListener?.(socket);
        callback(config.response);
      },
    };
  };
}

function errorRequest(error: Error, options: { throwFromEnd?: boolean } = {}): RequestFactory {
  return () => {
    let errorListener: ((value: RequestEventValue) => void) | undefined;
    return {
      once(event, listener) {
        if (event === 'error') errorListener = listener;
        return this;
      },
      end() {
        if (options.throwFromEnd) throw error;
        errorListener?.(error);
      },
    };
  };
}

const unusedRequest = errorRequest(new Error('unused'));

afterEach(() => {
  vi.doUnmock('node:http');
  vi.doUnmock('node:https');
  vi.resetModules();
});

describe('Provider pinned transport defensive coverage', () => {
  it('uses HTTPS transport, secureConnect, fallback status and sparse response headers', async () => {
    const httpsRequest = successfulRequest({
      connecting: true,
      expectedSocketEvent: 'secureConnect',
      response: response({
        body: 'tls-body',
        statusCode: undefined,
        statusMessage: '',
        headers: {
          'set-cookie': ['a=1', 'b=2'],
          'x-value': 'present',
          'x-undefined': undefined,
        },
      }),
    });
    const { createPinnedProviderFetch } = await loadWithRequests(unusedRequest, httpsRequest);
    const result = await createPinnedProviderFetch(
      binding('https://provider.test', 'provider.test'),
    )('https://provider.test/v1');

    expect(result.status).toBe(502);
    expect(result.statusText).toBe('');
    expect(result.headers.get('x-value')).toBe('present');
    expect(result.headers.get('set-cookie')).toContain('a=1');
    await expect(result.text()).resolves.toBe('tls-body');
  });

  it('recognizes an already-connected socket and resumes a synthetic bodyless response', async () => {
    const synthetic = response({ statusCode: 205, headers: {} });
    const resume = vi.spyOn(synthetic, 'resume');
    const httpRequest = successfulRequest({ connecting: false, response: synthetic });
    const { createPinnedProviderFetch } = await loadWithRequests(httpRequest, unusedRequest);
    const result = await createPinnedProviderFetch(
      binding('http://provider.local', 'provider.local'),
    )('http://provider.local/reset');

    expect(result.status).toBe(205);
    expect(result.body).toBeNull();
    expect(resume).toHaveBeenCalledOnce();
  });

  it('propagates an aborted request failure without trying another approved address', async () => {
    const aborted = new Error('aborted transport');
    const httpRequest = errorRequest(aborted);
    const { createPinnedProviderFetch } = await loadWithRequests(httpRequest, unusedRequest);
    const controller = new AbortController();
    controller.abort();

    await expect(
      createPinnedProviderFetch(binding('http://provider.local', 'provider.local'))(
        'http://provider.local/v1',
        { signal: controller.signal },
      ),
    ).rejects.toBe(aborted);
  });

  it('wraps a synchronous request failure, exhausts the address list and throws its last cause', async () => {
    const failure = new Error('request end failed');
    const httpRequest = errorRequest(failure, { throwFromEnd: true });
    const { createPinnedProviderFetch } = await loadWithRequests(httpRequest, unusedRequest);

    await expect(
      createPinnedProviderFetch(binding('http://provider.local', 'provider.local'))(
        'http://provider.local/v1',
      ),
    ).rejects.toBe(failure);
  });
});