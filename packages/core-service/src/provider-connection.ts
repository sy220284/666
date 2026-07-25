import { performance } from 'node:perf_hooks';

import {
  ProviderConnectionTestResultSchema,
  ProviderSummarySchema,
  type ProviderConfig,
  type ProviderConnectionTestResult,
  type ProviderSummary,
} from '@worldforge/contracts';

import { createProviderAdapter } from './provider-adapter-runtime.js';
import type { ProviderAdapterDependencies } from './provider-adapters.js';
import {
  inspectProviderEndpoint,
  validateProviderEndpoint,
  type ProviderDnsLookup,
} from './provider-endpoint.js';

export interface ProviderConnectionServiceOptions extends ProviderAdapterDependencies {
  readonly lookup?: ProviderDnsLookup;
  readonly clock?: { now(): Date };
}

export function summarizeProviderConfig(config: ProviderConfig): ProviderSummary {
  return ProviderSummarySchema.parse({
    id: config.id,
    name: config.name,
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    options: config.options,
    credentialConfigured: config.credentialRef !== null,
    endpoint: validateProviderEndpoint(config.baseUrl),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  });
}

export class ProviderConnectionService {
  readonly #options: ProviderConnectionServiceOptions;

  constructor(options: ProviderConnectionServiceOptions = {}) {
    this.#options = options;
  }

  async test(
    config: ProviderConfig,
    credential: string | null,
    signal?: AbortSignal,
  ): Promise<ProviderConnectionTestResult> {
    const endpoint = this.#options.lookup
      ? await inspectProviderEndpoint(config.baseUrl, this.#options.lookup)
      : await inspectProviderEndpoint(config.baseUrl);
    const provider = createProviderAdapter(config, credential, {
      ...(this.#options.fetch ? { fetch: this.#options.fetch } : {}),
    });
    const started = performance.now();
    const probe = await provider.testConnection(signal);
    return ProviderConnectionTestResultSchema.parse({
      providerId: config.id,
      protocol: config.protocol,
      endpoint,
      reachable: true,
      authentication: credential ? 'verified' : 'not-required',
      modelList: probe.modelList,
      actualModel: probe.actualModel,
      streaming: probe.streaming,
      structuredOutput: probe.structuredOutput,
      tokenUsageAvailable: probe.tokenUsageAvailable,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      checkedAt: (this.#options.clock?.now() ?? new Date()).toISOString(),
      warnings: [...endpoint.warnings, ...probe.warnings],
    });
  }
}
