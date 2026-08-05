import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import {
  request as httpsRequest,
  type RequestOptions as HttpsRequestOptions,
} from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

import type { ProviderEndpointBinding, ProviderResolvedAddress } from './provider-endpoint.js';
import { ProviderRuntimeError } from './provider-errors.js';

export interface ProviderPinnedFetchOptions {
  readonly ca?: string | Buffer | readonly (string | Buffer)[];
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

async function requestBody(
  body: BodyInit | null | undefined,
): Promise<string | Uint8Array | undefined> {
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
    const request = (secure ? httpsRequest : httpRequest)(requestOptions, (response) => {
      const stream = Readable.toWeb(response) as ReadableStream<Uint8Array>;
      resolve(
        new Response(stream, {
          status: response.statusCode ?? 502,
          statusText: response.statusMessage,
          headers: responseHeaders(response.headers),
        }),
      );
    });
    request.once('error', reject);
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
    let lastError: unknown;
    for (const address of binding.addresses) {
      try {
        return await requestAddress(binding, address, url, init, body, options);
      } catch (error) {
        if (init?.signal?.aborted) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new Error('PROVIDER_CONNECTION_ADDRESS_UNAVAILABLE');
  }) as typeof fetch;
}
