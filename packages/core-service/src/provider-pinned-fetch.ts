import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest, type RequestOptions as HttpsRequestOptions } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

import type { ProviderEndpointBinding, ProviderResolvedAddress } from './provider-endpoint.js';
import { ProviderRuntimeError } from './provider-errors.js';

export interface ProviderPinnedFetchOptions {
  readonly ca?: string | Buffer | (string | Buffer)[];
}

class ProviderAddressRequestFailure {
  constructor(
    readonly cause: unknown,
    readonly connectionEstablished: boolean,
  ) {}
}

function unsafe(message: string): never {
  throw new ProviderRuntimeError('AI_ENDPOINT_UNSAFE_013', message, false);
}

function normalizedHost(hostname: string): string {
  return hostname.replace(/^\[/u, '').replace(/\]$/u, '').replace(/\.$/u, '').toLowerCase();
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof Request) {
    unsafe('Provider adapters must pass an explicit URL and RequestInit to the bound transport.');
  }
  return new URL(input);
}

async function requestBody(body: RequestInit['body']): Promise<string | Uint8Array | undefined> {
  if (body === null || body === undefined) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  unsafe('Provider adapters attempted to send an unsupported request body type.');
}

function requestHeaders(init: RequestInit | undefined, url: URL): Record<string, string> {
  const values = new Headers(init?.headers);
  values.set('host', url.host);
  return Object.fromEntries(values.entries());
}

function responseHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

function responseHasBody(method: string | undefined, status: number): boolean {
  if (method?.toUpperCase() === 'HEAD') return false;
  return status !== 204 && status !== 205 && status !== 304;
}

function requestCanBeReplayed(method: string | undefined): boolean {
  return ['GET', 'HEAD', 'OPTIONS'].includes((method ?? 'GET').toUpperCase());
}

export function providerPinnedRequestOptions(
  binding: ProviderEndpointBinding,
  address: ProviderResolvedAddress,
  url: URL,
  init: RequestInit | undefined,
  options: ProviderPinnedFetchOptions = {},
): HttpsRequestOptions {
  const secure = url.protocol === 'https:';
  return {
    protocol: url.protocol,
    hostname: address.address,
    family: address.family,
    port: url.port || undefined,
    method: init?.method ?? 'GET',
    path: `${url.pathname}${url.search}`,
    headers: requestHeaders(init, url),
    agent: false,
    ...(init?.signal ? { signal: init.signal } : {}),
    ...(secure && isIP(binding.hostname) === 0 ? { servername: binding.hostname } : {}),
    ...(secure && options.ca ? { ca: options.ca } : {}),
  };
}

function requestAddress(
  binding: ProviderEndpointBinding,
  address: ProviderResolvedAddress,
  url: URL,
  init: RequestInit | undefined,
  body: string | Uint8Array | undefined,
  options: ProviderPinnedFetchOptions,
): Promise<Response> {
  const secure = url.protocol === 'https:';
  const requestOptions = providerPinnedRequestOptions(binding, address, url, init, options);

  return new Promise<Response>((resolve, reject) => {
    let connectionEstablished = false;
    const request = (secure ? httpsRequest : httpRequest)(requestOptions, (response) => {
      const status = response.statusCode ?? 502;
      const hasBody = responseHasBody(init?.method, status);
      const stream = hasBody ? (Readable.toWeb(response) as ReadableStream<Uint8Array>) : null;
      if (!hasBody) response.resume();
      resolve(
        new Response(stream, {
          status,
          ...(response.statusMessage ? { statusText: response.statusMessage } : {}),
          headers: responseHeaders(response.headers),
        }),
      );
    });
    request.once('socket', (socket) => {
      if (!socket.connecting) {
        connectionEstablished = true;
        return;
      }
      socket.once(secure ? 'secureConnect' : 'connect', () => {
        connectionEstablished = true;
      });
    });
    request.once('error', (error) => {
      reject(new ProviderAddressRequestFailure(error, connectionEstablished));
    });
    request.end(body);
  });
}

export function createPinnedProviderFetch(
  binding: ProviderEndpointBinding,
  options: ProviderPinnedFetchOptions = {},
): typeof fetch {
  if (binding.addresses.length === 0) {
    unsafe('The Provider endpoint has no approved connection address.');
  }

  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    if (
      url.origin !== binding.endpoint.origin ||
      normalizedHost(url.hostname) !== binding.hostname
    ) {
      unsafe('The Provider request escaped its approved origin or hostname.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      unsafe('The Provider request uses an unsupported transport protocol.');
    }

    const body = await requestBody(init?.body);
    const replayable = requestCanBeReplayed(init?.method);
    let lastError: unknown;
    for (const address of binding.addresses) {
      try {
        return await requestAddress(binding, address, url, init, body, options);
      } catch (error) {
        const failure =
          error instanceof ProviderAddressRequestFailure
            ? error
            : new ProviderAddressRequestFailure(error, false);
        if (init?.signal?.aborted) throw failure.cause;
        if (!replayable && failure.connectionEstablished) throw failure.cause;
        lastError = failure.cause;
      }
    }
    throw lastError ?? new Error('PROVIDER_CONNECTION_ADDRESS_UNAVAILABLE');
  }) as typeof fetch;
}
