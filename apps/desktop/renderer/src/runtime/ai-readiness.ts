import type { ProviderSummary } from '@worldforge/contracts';

export type AiReadinessStatus = 'ready' | 'not-configured' | 'not-verified';

export interface AiReadiness {
  readonly status: AiReadinessStatus;
  readonly providerId: string | null;
  readonly message: string;
}

export function resolveAiReadiness(
  providers: readonly ProviderSummary[],
  verifiedProviderIds: ReadonlySet<string>,
): AiReadiness {
  const verified = providers.find((provider) => verifiedProviderIds.has(provider.id));
  if (verified) {
    return {
      status: 'ready',
      providerId: verified.id,
      message: `“${verified.name}”已在当前会话完成连接验证。`,
    };
  }
  if (providers.length === 0) {
    return {
      status: 'not-configured',
      providerId: null,
      message: '尚未配置智能服务；自主写作和全部离线功能保持可用。',
    };
  }
  return {
    status: 'not-verified',
    providerId: null,
    message: '已有智能配置，但本次会话尚未完成真实连接测试。',
  };
}
