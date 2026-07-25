import { lookup as systemLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import {
  ProviderBaseUrlSchema,
  ProviderEndpointInfoSchema,
  type ProviderEndpointInfo,
  type ProviderEndpointScope,
} from '@worldforge/contracts';

import { ProviderRuntimeError } from './provider-errors.js';

export type ProviderDnsLookup = typeof systemLookup;

function unsafe(message: string): never {
  throw new ProviderRuntimeError('AI_ENDPOINT_UNSAFE_013', message, false);
}

function normalizedHost(hostname: string): string {
  return hostname.replace(/^\[/u, '').replace(/\]$/u, '').replace(/\.$/u, '').toLowerCase();
}

function ipv4Scope(host: string): ProviderEndpointScope | 'unsafe' {
  const parts = host.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return 'unsafe';
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 127) return 'loopback';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'lan';
  if (a === 0 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || a >= 224) {
    return 'unsafe';
  }
  return 'external';
}

function literalScope(hostname: string): ProviderEndpointScope | 'unsafe' | null {
  const host = normalizedHost(hostname);
  const version = isIP(host);
  if (version === 4) return ipv4Scope(host);
  if (version !== 6) return null;
  if (host === '::1') return 'loopback';
  if (host === '::') return 'unsafe';
  if (
    host.startsWith('fe8') ||
    host.startsWith('fe9') ||
    host.startsWith('fea') ||
    host.startsWith('feb')
  ) {
    return 'unsafe';
  }
  if (host.startsWith('ff')) return 'unsafe';
  if (host.startsWith('fc') || host.startsWith('fd')) return 'lan';
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  return mapped ? ipv4Scope(mapped) : 'external';
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

export async function inspectProviderEndpoint(
  baseUrl: string,
  lookup: ProviderDnsLookup = systemLookup,
): Promise<ProviderEndpointInfo> {
  const initial = validateProviderEndpoint(baseUrl);
  const url = new URL(baseUrl);
  const host = normalizedHost(url.hostname);
  if (
    literalScope(host) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    return initial;
  }
  let addresses: readonly { readonly address: string; readonly family: number }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider hostname could not be resolved.',
      true,
    );
  }
  if (addresses.length === 0) {
    throw new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider hostname has no address.',
      true,
    );
  }
  const scopes = new Set<ProviderEndpointScope>();
  for (const address of addresses) {
    const scope = literalScope(address.address);
    if (!scope || scope === 'unsafe')
      unsafe('The Provider hostname resolved to an unsafe address.');
    scopes.add(scope);
  }
  if (scopes.size !== 1)
    unsafe('The Provider hostname resolved across mixed network trust boundaries.');
  const [resolvedScope] = scopes;
  if (!resolvedScope) unsafe('The Provider endpoint scope could not be determined.');
  if (resolvedScope === 'external' && url.protocol !== 'https:') {
    unsafe('External Provider endpoints must use HTTPS.');
  }
  return ProviderEndpointInfoSchema.parse({
    scope: resolvedScope,
    origin: url.origin,
    secureTransport: url.protocol === 'https:',
    warnings: endpointWarnings(resolvedScope, url.protocol === 'https:'),
  });
}
