import type { ProviderEndpointScope, ProviderSummary } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import {
  RendererCommandCoordinator,
  type RendererCommandScope,
} from '../../runtime/command-coordinator.js';

const PROVIDER_COMMAND = 'provider-command';

export interface ProviderRefreshInput {
  readonly bridge: RendererBridgeAdapter;
  readonly setProviders: (providers: readonly ProviderSummary[]) => void;
  readonly onProvidersChanged: (providers: readonly ProviderSummary[]) => void;
  readonly setMessage: (message: string) => void;
}

export async function refreshProviderSettings(
  input: ProviderRefreshInput,
  scope?: RendererCommandScope,
): Promise<void> {
  try {
    const outcome = await input.bridge.providers.list({ mode: 'replace' });
    if (scope && !scope.isCurrent()) return;
    if (outcome.state === 'success') {
      input.setProviders(outcome.data.providers);
      input.onProvidersChanged(outcome.data.providers);
      input.setMessage(
        outcome.data.providers.length ? 'AI连接已加载。' : '尚未配置AI连接；离线写作功能不受影响。',
      );
    } else if (outcome.state === 'failure') {
      input.setMessage(authorErrorSummary(outcome.error));
    }
  } catch {
    if (scope?.isCurrent() ?? true) input.setMessage('AI连接读取未完成，请重试。');
  }
}

export interface ProviderCommandInput {
  readonly coordinator: RendererCommandCoordinator;
  readonly pendingKey: string;
  readonly setPending: (pending: string | null) => void;
  readonly setMessage: (message: string) => void;
  readonly operation: (scope: RendererCommandScope) => Promise<void>;
}

export async function runProviderSettingsCommand(input: ProviderCommandInput): Promise<void> {
  const result = await input.coordinator.run({
    key: PROVIDER_COMMAND,
    policy: 'reject',
    operation: async (scope) => {
      input.setPending(input.pendingKey);
      await input.operation(scope);
    },
  });
  if (result.state === 'rejected') {
    input.setMessage('已有AI连接操作正在处理，请完成后再试。');
    return;
  }
  if (!input.coordinator.isLatest(PROVIDER_COMMAND, result.token)) return;
  input.setPending(null);
  if (result.state === 'failed') input.setMessage('AI连接操作未完成，请重试。');
}

export function providerScopeLabel(scope: ProviderEndpointScope): string {
  return scope === 'loopback' ? '当前设备' : scope === 'lan' ? '局域网' : '外部网络';
}
