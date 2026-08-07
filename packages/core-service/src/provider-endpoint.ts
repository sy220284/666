import { lookup as systemLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import {
  ProviderBaseUrlSchema,
  ProviderEndpointInfoSchema,
  type ProviderEndpointInfo,
  type ProviderEndpointScope,
} from '@worldforge/contracts';

import { ProviderRuntimeError } from './provider-errors.js';

export interface ProviderResolvedAddress {
  readonly address: string;
  readonly family: number;
}

export interface ProviderEndpointBinding {
  readonly endpoint: ProviderEndpointInfo;
  readonly hostname: string;
  readonly addresses: readonly ProviderResolvedAddress[];
}

export type ProviderDnsLookup = (
  hostname: string,
  options: { readonly all: true; readonly verbatim: true },
) => Promise<readonly ProviderResolvedAddress[]>;

function unsafe(message: string): never {
  throw new ProviderRuntimeError('AI_ENDPOINT_UNSAFE_013', message, false);
}

function normalizedHost(hostname: string): string {
  return hostname.replace(/^\[/u, '').replace(/\]$/u, '').replace(/\.$/u, '').toLowerCase();
}

function ipv4Parts(host: string): readonly [number, number, number, number] | null {
  const parts = host.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return parts as [number, number, number, number];
}

function ipv4Scope(host: string): ProviderEndpointScope | 'unsafe' {
  const parts = ipv4Parts(host);
  if (!parts) return 'unsafe';
  const [a, b, c] = parts;
  if (a === 127) return 'loopback';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
    return 'lan';
  }
  if (
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  ) {
    return 'unsafe';
  }
  return 'external';
}

function parseIpv6Words(host: string): readonly number[] | null {
  const pieces = host.split('::');
  if (pieces.length > 2) return null;
  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const words: number[] = [];
    for (const token of side.split(':')) {
      if (token.includes('.')) {
        const ipv4 = ipv4Parts(token);
        if (!ipv4) return null;
        words.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/iu.test(token)) return null;
        words.push(Number.parseInt(token, 16));
      }
    }
    return words;
  };
  const left = parseSide(pieces[0] ?? '');
  const right = parseSide(pieces[1] ?? '');
  if (!left || !right) return null;
  if (pieces.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function ipv6Scope(host: string): ProviderEndpointScope | 'unsafe' {
  const words = parseIpv6Words(host);
  if (!words || words.length !== 8) return 'unsafe';
  if (words.every((word) => word === 0)) return 'unsafe';
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return 'loopback';
  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const compatible = words.slice(0, 6).every((word) => word === 0);
  if (mapped || compatible) {
    const ipv4 = `${(words[6]! >> 8) & 0xff}.${words[6]! & 0xff}.${
      (words[7]! >> 8) & 0xff
    }.${words[7]! & 0xff}`;
    return ipv4Scope(ipv4);
  }
  const first = words[0]!;
  if ((first & 0xfe00) === 0xfc00) return 'lan';
  if (
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xffc0) === 0xfec0 ||
    (first & 0xff00) === 0xff00
  ) {
    return 'unsafe';
  }
  if (first === 0x2001 && words[1] === 0x0db8) return 'unsafe';
  return 'external';
}

function literalScope(hostname: string): ProviderEndpointScope | 'unsafe' | null {
  const host = normalizedHost(hostname);
  const version = isIP(host);
  if (version === 4) return ipv4Scope(host);
  if (version === 6) return ipv6Scope(host);
  return null;
}

function hostnameScope(hostname: string): ProviderEndpointScope {
  const host = normalizedHost(hostname);
  const literal = literalScope(host);
  if (literal === 'unsafe') unsafe('The Provider endpoint uses a blocked or non-routable address.');
  if (literal) return literal;
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback';
  if (host.endsWith('.local')) return 'lan';
  if (host === 'metadata.google.internal') {
    unsafe('The Provider endpoint targets a blocked instance metadata host.');
  }
  return 'external';
}

function endpointWarnings(scope: ProviderEndpointScope, secureTransport: boolean): string[] {
  const warnings =
    scope === 'loopback'
      ? ['请求仅发送到当前设备上的用户配置服务。']
      : scope === 'lan'
        ? ['项目内容将发送到局域网设备，请确认该设备可信。']
        : ['项目内容将通过HTTPS发送到外部Provider。'];
  if (!secureTransport) warnings.push('当前连接未使用TLS，仅允许本机或受信局域网端点。');
  return warnings;
}

export function validateProviderEndpoint(baseUrl: string): ProviderEndpointInfo {
  const parsedValue = ProviderBaseUrlSchema.safeParse(baseUrl);
  if (!parsedValue.success) unsafe('The Provider URL is invalid or contains embedded credentials.');
  const url = new URL(parsedValue.data);
  if (url.search || url.hash) {
    unsafe('Provider Base URLs cannot contain query parameters or fragments.');
  }
  if (url.port === '0') unsafe('The Provider endpoint cannot use port 0.');
  const scope = hostnameScope(url.hostname);
  const secureTransport = url.protocol === 'https:';
  if (scope === 'external' && !secureTransport) {
    unsafe('External Provider endpoints must use HTTPS.');
  }
  return ProviderEndpointInfoSchema.parse({
    scope,
    origin: url.origin,
    secureTransport,
    warnings: endpointWarnings(scope, secureTransport),
  });
}

export async function resolveProviderEndpoint(
  baseUrl: string,
  lookup: ProviderDnsLookup = systemLookup as ProviderDnsLookup,
): Promise<ProviderEndpointBinding> {
  const endpoint = validateProviderEndpoint(baseUrl);
  const url = new URL(baseUrl);
  const hostname = normalizedHost(url.hostname);
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    return {
      endpoint,
      hostname,
      addresses: [{ address: hostname, family: literalFamily }],
    };
  }

  let resolved: readonly ProviderResolvedAddress[];
  try {
    resolved = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider hostname could not be resolved.',
      true,
    );
  }
  if (resolved.length === 0) {
    throw new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider hostname has no address.',
      true,
    );
  }

  const scopes = new Set<ProviderEndpointScope>();
  const addresses = new Map<string, ProviderResolvedAddress>();
  for (const candidate of resolved) {
    const address = normalizedHost(candidate.address);
    const family = isIP(address);
    const scope = literalScope(address);
    if (
      (family !== 4 && family !== 6) ||
      family !== candidate.family ||
      !scope ||
      scope === 'unsafe'
    ) {
      unsafe('The Provider hostname resolved to an unsafe address.');
    }
    scopes.add(scope);
    addresses.set(`${family}:${address}`, { address, family });
  }
  if (scopes.size !== 1) {
    unsafe('The Provider hostname resolved across mixed network trust boundaries.');
  }
  const [resolvedScope] = scopes;
  if (!resolvedScope) unsafe('The Provider endpoint scope could not be determined.');
  if (resolvedScope !== endpoint.scope) {
    unsafe('The Provider hostname resolved outside its declared network trust boundary.');
  }
  if (resolvedScope === 'external' && url.protocol !== 'https:') {
    unsafe('External Provider endpoints must use HTTPS.');
  }

  return {
    endpoint,
    hostname,
    addresses: [...addresses.values()],
  };
}

export async function inspectProviderEndpoint(
  baseUrl: string,
  lookup: ProviderDnsLookup = systemLookup as ProviderDnsLookup,
): Promise<ProviderEndpointInfo> {
  return (await resolveProviderEndpoint(baseUrl, lookup)).endpoint;
}
