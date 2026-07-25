from pathlib import Path


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one target, found {count}')
    target.write_text(text.replace(old, new, 1))


replace_once(
    'apps/desktop/main/src/core-supervisor.ts',
    "  CoreProjectOperationSchema,\n  CoreProjectResultSchema,\n",
    "  CoreProjectOperationSchema,\n  CoreProjectResultSchema,\n  CoreProviderOperationSchema,\n  CoreProviderResultSchema,\n",
    'supervisor provider schemas',
)
replace_once(
    'apps/desktop/main/src/core-supervisor.ts',
    "  type CoreProjectOperation,\n  type CoreProjectResult,\n",
    "  type CoreProjectOperation,\n  type CoreProjectResult,\n  type CoreProviderOperation,\n  type CoreProviderResult,\n",
    'supervisor provider types',
)
replace_once(
    'apps/desktop/main/src/core-supervisor.ts',
    "  async invokeProjectOperation(\n",
    "  async invokeProviderOperation(\n    requestId: string,\n    input: CoreProviderOperation,\n  ): Promise<CoreProviderResult> {\n    const operation = CoreProviderOperationSchema.parse(input);\n    const process = this.#process;\n    if (!process || this.#state !== 'healthy') {\n      return CoreProviderResultSchema.parse({\n        ok: false,\n        operation: operation.operation,\n        errorCode: 'COMMON_INTERNAL_999',\n      });\n    }\n\n    const timeout =\n      operation.operation === 'provider.connection.test'\n        ? Math.max(this.#commandTimeoutMs, Math.min(1_200_000, operation.config.timeoutMs * 4 + 5_000))\n        : this.#commandTimeoutMs;\n    const response = this.#waitForMessage(\n      (message) => message.type === 'core.provider.result' && message.requestId === requestId,\n      timeout,\n    );\n    process.postMessage({\n      type: 'core.provider.command',\n      protocolVersion: PROTOCOL_VERSION,\n      requestId,\n      operation,\n    });\n    const result = await response;\n    if (result?.type === 'core.provider.result') return result.result;\n    return CoreProviderResultSchema.parse({\n      ok: false,\n      operation: operation.operation,\n      errorCode: 'COMMON_TIMEOUT_005',\n    });\n  }\n\n  async invokeProjectOperation(\n",
    'supervisor provider method',
)

replace_once(
    'apps/desktop/main/src/ipc-handlers.ts',
    "  ProjectListRecentCommandSchema,\n",
    "  ProjectListRecentCommandSchema,\n  PROVIDER_CORE_OPERATIONS,\n  ProviderListCommandSchema,\n  ProviderRemoveCommandSchema,\n  ProviderSaveCommandSchema,\n  ProviderTestConnectionCommandSchema,\n",
    'main provider command imports',
)
replace_once(
    'apps/desktop/main/src/ipc-handlers.ts',
    "    IPC_CHANNELS.projectListRecent,\n",
    "    IPC_CHANNELS.providerList,\n    IPC_CHANNELS.providerSave,\n    IPC_CHANNELS.providerRemove,\n    IPC_CHANNELS.providerTestConnection,\n    IPC_CHANNELS.projectListRecent,\n",
    'main provider invoke channels',
)
replace_once(
    'apps/desktop/main/src/ipc-handlers.ts',
    "  register(IPC_CHANNELS.projectListRecent, async (event, raw) => {\n",
    r'''  const providerFailure = (requestId: string, code: ErrorCode): CommandFailure => {
    const semantics: Readonly<Record<string, { message: string; retryable: boolean; userAction?: string }>> = {
      AI_PROVIDER_NOT_CONFIGURED_001: {
        message: '未找到Provider配置。',
        retryable: false,
        userAction: '刷新Provider列表或重新保存配置。',
      },
      AI_CREDENTIAL_MISSING_002: {
        message: 'Provider凭据缺失或安全存储不可用。',
        retryable: false,
        userAction: '重新保存凭据；本地无密钥服务可清除凭据后重试。',
      },
      AI_CONNECTION_FAILED_003: {
        message: '无法连接Provider。',
        retryable: true,
        userAction: '检查服务是否运行、地址、端口和网络连接。',
      },
      AI_AUTH_FAILED_004: {
        message: 'Provider认证失败。',
        retryable: false,
        userAction: '检查API密钥或本地服务认证设置。',
      },
      AI_RATE_LIMITED_005: {
        message: 'Provider当前限流。',
        retryable: true,
        userAction: '稍后重试或检查Provider配额。',
      },
      AI_REQUEST_TIMEOUT_006: {
        message: 'Provider连接测试超时。',
        retryable: true,
        userAction: '检查服务负载或适当增加超时时间。',
      },
      AI_STREAM_INTERRUPTED_009: {
        message: 'Provider流式响应中断。',
        retryable: true,
        userAction: '检查网络稳定性与Provider流式兼容性。',
      },
      AI_MODEL_UNSUPPORTED_010: {
        message: 'Provider未提供配置的模型或适配器。',
        retryable: false,
        userAction: '检查模型ID；Custom协议必须使用仓库已批准适配器。',
      },
      AI_ENDPOINT_UNSAFE_013: {
        message: 'Provider地址未通过安全检查。',
        retryable: false,
        userAction: '使用回环/受信局域网地址，或使用HTTPS外部端点。',
      },
    };
    const resolved = semantics[code] ?? {
      message: 'Provider操作未完成。',
      retryable: code === 'COMMON_INTERNAL_999' || code === 'COMMON_TIMEOUT_005',
    };
    return failure(
      requestId,
      code,
      resolved.message,
      resolved.retryable,
      undefined,
      undefined,
      resolved.userAction,
    );
  };

  register(IPC_CHANNELS.providerList, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProviderListCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeProviderOperation(parsed.data.requestId, {
      operation: PROVIDER_CORE_OPERATIONS.list,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : providerFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.providerSave, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProviderSaveCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const requestId = parsed.data.requestId;
    const existingResult = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.get,
      providerId: parsed.data.payload.config.id,
    });
    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    const existing = existingResult.data.provider;
    let credentialRef = existing?.credentialRef ?? null;
    let createdCredentialRef: string | null = null;
    try {
      if (parsed.data.payload.credential.action === 'replace') {
        createdCredentialRef = await options.credentialBroker.store(
          parsed.data.payload.config.id,
          parsed.data.payload.credential.credential,
        );
        credentialRef = createdCredentialRef;
      } else if (parsed.data.payload.credential.action === 'remove') {
        credentialRef = null;
      }
    } catch {
      return providerFailure(requestId, 'AI_CREDENTIAL_MISSING_002');
    }

    const saved = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.upsert,
      config: { ...parsed.data.payload.config, credentialRef },
    });
    if (!saved.ok) {
      if (createdCredentialRef) {
        try {
          await options.credentialBroker.remove(createdCredentialRef);
        } catch {
          await options.logger.log('warn', 'credential.rollback.failed', {
            providerId: parsed.data.payload.config.id,
            errorCode: 'AI_CREDENTIAL_MISSING_002',
          });
        }
      }
      return providerFailure(requestId, saved.errorCode);
    }

    if (existing?.credentialRef && existing.credentialRef !== credentialRef) {
      try {
        await options.credentialBroker.remove(existing.credentialRef);
      } catch {
        await options.logger.log('warn', 'credential.cleanup.failed', {
          providerId: parsed.data.payload.config.id,
          errorCode: 'AI_CREDENTIAL_MISSING_002',
        });
      }
    }
    return success(requestId, saved.data);
  });

  register(IPC_CHANNELS.providerRemove, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProviderRemoveCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const requestId = parsed.data.requestId;
    const existingResult = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.get,
      providerId: parsed.data.payload.providerId,
    });
    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    const removed = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.remove,
      providerId: parsed.data.payload.providerId,
    });
    if (!removed.ok) return providerFailure(requestId, removed.errorCode);
    if (removed.data.removed && existingResult.data.provider?.credentialRef) {
      try {
        await options.credentialBroker.remove(existingResult.data.provider.credentialRef);
      } catch {
        await options.logger.log('warn', 'credential.cleanup.failed', {
          providerId: parsed.data.payload.providerId,
          errorCode: 'AI_CREDENTIAL_MISSING_002',
        });
      }
    }
    return success(requestId, removed.data);
  });

  register(IPC_CHANNELS.providerTestConnection, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProviderTestConnectionCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const requestId = parsed.data.requestId;
    const existingResult = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.get,
      providerId: parsed.data.payload.providerId,
    });
    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    const config = existingResult.data.provider;
    if (!config) return providerFailure(requestId, 'AI_PROVIDER_NOT_CONFIGURED_001');
    let credential: string | null = null;
    if (config.credentialRef) {
      try {
        credential = await options.credentialBroker.resolve(config.credentialRef);
      } catch {
        return providerFailure(requestId, 'AI_CREDENTIAL_MISSING_002');
      }
      if (!credential) return providerFailure(requestId, 'AI_CREDENTIAL_MISSING_002');
    }
    const result = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.testConnection,
      config,
      credential,
    });
    credential = null;
    return result.ok
      ? success(requestId, result.data)
      : providerFailure(requestId, result.errorCode);
  });

  register(IPC_CHANNELS.projectListRecent, async (event, raw) => {
''',
    'main provider handlers',
)

replace_once(
    'apps/desktop/preload/src/index.ts',
    "  ProjectActiveResultSchema,\n",
    "  ProviderConnectionTestResultEnvelopeSchema,\n  ProviderListCommandSchema,\n  ProviderListResultSchema,\n  ProviderRemoveCommandSchema,\n  ProviderRemoveResultSchema,\n  ProviderSaveCommandSchema,\n  ProviderSummaryResultSchema,\n  ProviderTestConnectionCommandSchema,\n  ProjectActiveResultSchema,\n",
    'preload provider imports',
)
replace_once(
    'apps/desktop/preload/src/index.ts',
    "  settings: {\n",
    "  providers: {\n    list: () =>\n      invoke(\n        IPC_CHANNELS.providerList,\n        ProviderListCommandSchema.parse(envelope(APP_COMMANDS.providerList, {})),\n        ProviderListResultSchema,\n      ),\n    save: (input) =>\n      invoke(\n        IPC_CHANNELS.providerSave,\n        ProviderSaveCommandSchema.parse(envelope(APP_COMMANDS.providerSave, input)),\n        ProviderSummaryResultSchema,\n      ),\n    remove: (providerId) =>\n      invoke(\n        IPC_CHANNELS.providerRemove,\n        ProviderRemoveCommandSchema.parse(\n          envelope(APP_COMMANDS.providerRemove, { providerId }),\n        ),\n        ProviderRemoveResultSchema,\n      ),\n    testConnection: (providerId) =>\n      invoke(\n        IPC_CHANNELS.providerTestConnection,\n        ProviderTestConnectionCommandSchema.parse(\n          envelope(APP_COMMANDS.providerTestConnection, { providerId }),\n        ),\n        ProviderConnectionTestResultEnvelopeSchema,\n      ),\n  },\n  settings: {\n",
    'preload provider bridge',
)

replace_once(
    'apps/desktop/renderer/src/bridge/renderer-bridge-adapter.ts',
    "  | 'settings'\n",
    "  | 'settings'\n  | 'providers'\n",
    'renderer provider base domain',
)
replace_once(
    'apps/desktop/renderer/src/bridge/renderer-bridge-adapter.ts',
    "  readonly settings: AdaptedDomain<WorldforgeBridge['settings']>;\n",
    "  readonly settings: AdaptedDomain<WorldforgeBridge['settings']>;\n  readonly providers: AdaptedDomain<WorldforgeBridge['providers']>;\n",
    'renderer provider adapter type',
)
replace_once(
    'apps/desktop/renderer/src/bridge/renderer-bridge-adapter.ts',
    "    settings: adaptDomain('settings', requireDomain(bridge.settings, 'settings'), coordinator),\n",
    "    settings: adaptDomain('settings', requireDomain(bridge.settings, 'settings'), coordinator),\n    providers: adaptDomain('providers', requireDomain(bridge.providers, 'providers'), coordinator),\n",
    'renderer provider adapter creation',
)

replace_once(
    'apps/desktop/renderer/src/shell/settings-navigation-model.ts',
    "export const SETTINGS_BASIC_SECTION_IDS = ['general', 'editor', 'appearance', 'advanced'] as const;",
    "export const SETTINGS_BASIC_SECTION_IDS = [\n  'general',\n  'editor',\n  'appearance',\n  'providers',\n  'advanced',\n] as const;",
    'settings provider section ids',
)
replace_once(
    'apps/desktop/renderer/src/shell/settings-navigation-model.ts',
    "  appearance: true,\n  advanced: false,\n",
    "  appearance: true,\n  providers: false,\n  advanced: false,\n",
    'settings provider default availability',
)
replace_once(
    'apps/desktop/renderer/src/shell/settings-navigation-model.ts',
    "  {\n    id: 'advanced',\n",
    "  {\n    id: 'providers',\n    label: 'AI服务',\n    beginnerDescription: '配置本机或外部模型服务',\n    professionalDescription: 'Provider、端点边界、凭据和连接能力测试',\n  },\n  {\n    id: 'advanced',\n",
    'settings provider definition',
)

write(
    'apps/desktop/renderer/src/features/settings/provider-settings.tsx',
    r'''import { useEffect, useState, type FormEvent } from 'react';

import type {
  ProviderEditableConfig,
  ProviderEndpointScope,
  ProviderSummary,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

export interface ProviderSettingsProps {
  readonly bridge: RendererBridgeAdapter;
}

const EMPTY_CONFIG: ProviderEditableConfig = {
  id: '',
  name: '',
  protocol: 'openai_compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: '',
  timeoutMs: 30_000,
  options: {},
};

export function ProviderSettings({ bridge }: ProviderSettingsProps) {
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [draft, setDraft] = useState<ProviderEditableConfig>(EMPTY_CONFIG);
  const [credential, setCredential] = useState('');
  const [removeCredential, setRemoveCredential] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('正在读取本机Provider配置…');
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof testShape>> | null>(null);

  const refresh = async (): Promise<void> => {
    const outcome = await bridge.providers.list({ mode: 'replace' });
    if (outcome.state === 'success') {
      setProviders(outcome.data.providers);
      setMessage(outcome.data.providers.length ? nullMessage() : '尚未配置AI服务；离线写作功能不受影响。');
    } else if (outcome.state === 'failure') {
      setMessage(`${outcome.error.message}（${outcome.error.code}）`);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const edit = (provider: ProviderSummary): void => {
    setDraft({
      id: provider.id,
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      model: provider.model,
      timeoutMs: provider.timeoutMs,
      options: provider.options,
    });
    setCredential('');
    setRemoveCredential(false);
    setTestResult(null);
    setMessage(`正在编辑“${provider.name}”；凭据不会回显。`);
  };

  const reset = (): void => {
    setDraft(EMPTY_CONFIG);
    setCredential('');
    setRemoveCredential(false);
    setDeleteArmed(null);
    setTestResult(null);
    setMessage('新建Provider配置。');
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending('save');
    setTestResult(null);
    const outcome = await bridge.providers.save({
      config: draft,
      credential: credential
        ? { action: 'replace', credential }
        : removeCredential
          ? { action: 'remove' }
          : { action: 'preserve' },
    });
    setPending(null);
    setCredential('');
    setRemoveCredential(false);
    if (outcome.state === 'success') {
      setDraft({
        id: outcome.data.id,
        name: outcome.data.name,
        protocol: outcome.data.protocol,
        baseUrl: outcome.data.baseUrl,
        model: outcome.data.model,
        timeoutMs: outcome.data.timeoutMs,
        options: outcome.data.options,
      });
      setMessage(`已保存“${outcome.data.name}”。实际密钥仅保存在系统安全存储。`);
      await refresh();
    } else if (outcome.state === 'failure') {
      setMessage(`${outcome.error.message}（${outcome.error.code}）`);
    }
  };

  const remove = async (provider: ProviderSummary): Promise<void> => {
    if (deleteArmed !== provider.id) {
      setDeleteArmed(provider.id);
      setMessage(`再次点击删除“${provider.name}”以确认。`);
      return;
    }
    setPending(`remove:${provider.id}`);
    const outcome = await bridge.providers.remove(provider.id);
    setPending(null);
    setDeleteArmed(null);
    if (outcome.state === 'success') {
      if (draft.id === provider.id) reset();
      setMessage(outcome.data.removed ? `已删除“${provider.name}”及其凭据引用。` : '配置已不存在。');
      await refresh();
    } else if (outcome.state === 'failure') {
      setMessage(`${outcome.error.message}（${outcome.error.code}）`);
    }
  };

  const test = async (provider: ProviderSummary): Promise<void> => {
    setPending(`test:${provider.id}`);
    setTestResult(null);
    setMessage(`正在测试“${provider.name}”…`);
    const outcome = await bridge.providers.testConnection(provider.id, { mode: 'replace' });
    setPending(null);
    if (outcome.state === 'success') {
      setTestResult(outcome.data);
      setMessage(`连接成功：${outcome.data.actualModel}，${outcome.data.latencyMs}ms。`);
    } else if (outcome.state === 'failure') {
      setMessage(`${outcome.error.message}（${outcome.error.code}）`);
    }
  };

  return (
    <section className="react-settings-form" data-provider-settings data-settings-section="providers">
      <header>
        <h2>AI服务与连接</h2>
        <p>Provider不可用不会影响写作、版本、搜索、恢复或导出。密钥只进入系统安全存储和单次请求内存。</p>
      </header>
      <p aria-live="polite" data-provider-status role="status">
        {message}
      </p>
      <div className="provider-settings-grid">
        <form data-provider-form onSubmit={(event) => void save(event)}>
          <label>
            <span>配置ID</span>
            <input
              required
              data-provider-id
              disabled={providers.some((provider) => provider.id === draft.id)}
              pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
              value={draft.id}
              onChange={(event) => setDraft({ ...draft, id: event.target.value })}
            />
          </label>
          <label>
            <span>显示名称</span>
            <input
              required
              data-provider-name
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            <span>协议</span>
            <select
              data-provider-protocol
              value={draft.protocol}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  protocol: event.target.value as ProviderEditableConfig['protocol'],
                })
              }
            >
              <option value="openai_compatible">OpenAI兼容</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label>
            <span>Base URL</span>
            <input
              required
              data-provider-base-url
              type="url"
              value={draft.baseUrl}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
            />
          </label>
          <label>
            <span>模型ID</span>
            <input
              required
              data-provider-model
              value={draft.model}
              onChange={(event) => setDraft({ ...draft, model: event.target.value })}
            />
          </label>
          <label>
            <span>单次请求超时（毫秒）</span>
            <input
              data-provider-timeout
              max={300_000}
              min={1_000}
              step={1_000}
              type="number"
              value={draft.timeoutMs}
              onChange={(event) => setDraft({ ...draft, timeoutMs: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>API密钥（留空即保持；本地无密钥服务可不填）</span>
            <input
              autoComplete="new-password"
              data-provider-credential
              type="password"
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
            />
          </label>
          <label className="react-switch-row">
            <input
              checked={removeCredential}
              data-provider-remove-credential
              type="checkbox"
              onChange={(event) => setRemoveCredential(event.target.checked)}
            />
            <span>保存时清除已有密钥</span>
          </label>
          <footer>
            <button className="quiet-button" disabled={Boolean(pending)} type="button" onClick={reset}>
              新建
            </button>
            <button className="primary-button" data-provider-save disabled={Boolean(pending)} type="submit">
              {pending === 'save' ? '正在保存…' : '保存配置'}
            </button>
          </footer>
        </form>
        <div data-provider-list>
          {providers.length === 0 ? <p>暂无Provider配置。</p> : null}
          {providers.map((provider) => (
            <article className="feature-card" data-provider-card={provider.id} key={provider.id}>
              <h3>{provider.name}</h3>
              <p>{provider.protocol} · {provider.model}</p>
              <p>{provider.baseUrl}</p>
              <p>{scopeLabel(provider.endpoint.scope)} · {provider.endpoint.secureTransport ? 'TLS' : '未使用TLS'}</p>
              <p>{provider.credentialConfigured ? '已配置密钥' : '无密钥'}</p>
              {provider.endpoint.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              <footer>
                <button className="quiet-button" disabled={Boolean(pending)} type="button" onClick={() => edit(provider)}>
                  编辑
                </button>
                <button
                  className="primary-button"
                  data-provider-test={provider.id}
                  disabled={Boolean(pending)}
                  type="button"
                  onClick={() => void test(provider)}
                >
                  {pending === `test:${provider.id}` ? '正在测试…' : '测试连接'}
                </button>
                <button
                  className="quiet-button"
                  data-provider-remove={provider.id}
                  disabled={Boolean(pending)}
                  type="button"
                  onClick={() => void remove(provider)}
                >
                  {deleteArmed === provider.id ? '确认删除' : '删除'}
                </button>
              </footer>
            </article>
          ))}
        </div>
      </div>
      {testResult ? (
        <dl className="react-diagnostic-list" data-provider-test-result>
          <div><dt>网络边界</dt><dd>{scopeLabel(testResult.endpoint.scope)}</dd></div>
          <div><dt>模型列表</dt><dd>{testResult.modelList === 'verified' ? '已验证' : '端点不支持'}</dd></div>
          <div><dt>流式</dt><dd>{testResult.streaming ? '通过' : '未通过'}</dd></div>
          <div><dt>结构化输出</dt><dd>{testResult.structuredOutput ? '通过' : '未通过'}</dd></div>
          <div><dt>Token统计</dt><dd>{testResult.tokenUsageAvailable ? 'Provider返回' : '需要本地估算'}</dd></div>
          {testResult.warnings.map((warning) => <div key={warning}><dt>提示</dt><dd>{warning}</dd></div>)}
        </dl>
      ) : null}
    </section>
  );
}

function scopeLabel(scope: ProviderEndpointScope): string {
  return scope === 'loopback' ? '当前设备' : scope === 'lan' ? '局域网' : '外部网络';
}

function nullMessage(): string {
  return 'Provider配置已加载。';
}

async function testShape() {
  return null as never;
}
''',
)

replace_once(
    'apps/desktop/renderer/src/features/settings/settings-page.tsx',
    "import type { AppDisclosureMode } from '../../shell/app-shell-model.js';\n",
    "import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';\nimport type { AppDisclosureMode } from '../../shell/app-shell-model.js';\nimport { ProviderSettings } from './provider-settings.js';\n",
    'settings provider imports',
)
replace_once(
    'apps/desktop/renderer/src/features/settings/settings-page.tsx',
    "  readonly disclosureMode: AppDisclosureMode;\n",
    "  readonly bridge: RendererBridgeAdapter;\n  readonly disclosureMode: AppDisclosureMode;\n",
    'settings bridge prop',
)
replace_once(
    'apps/desktop/renderer/src/features/settings/settings-page.tsx',
    "    availability: { general: true, editor: true, appearance: true, advanced: true },\n",
    "    availability: { general: true, editor: true, appearance: true, providers: true, advanced: true },\n",
    'settings provider availability one',
)
replace_once(
    'apps/desktop/renderer/src/features/settings/settings-page.tsx',
    "      availability: { general: true, editor: true, appearance: true, advanced: true },\n",
    "      availability: { general: true, editor: true, appearance: true, providers: true, advanced: true },\n",
    'settings provider availability two',
)
replace_once(
    'apps/desktop/renderer/src/features/settings/settings-page.tsx',
    "          {section === 'appearance' ? <AppearanceSettings {...props} /> : null}\n          {section === 'advanced' ? <AdvancedSettings {...props} /> : null}\n",
    "          {section === 'appearance' ? <AppearanceSettings {...props} /> : null}\n          {section === 'providers' ? <ProviderSettings bridge={props.bridge} /> : null}\n          {section === 'advanced' ? <AdvancedSettings {...props} /> : null}\n",
    'settings provider render',
)
replace_once(
    'apps/desktop/renderer/src/app/app-shell-m3.tsx',
    "            <SettingsPage\n              appearance={appearance}\n",
    "            <SettingsPage\n              appearance={appearance}\n              bridge={bridge}\n",
    'app shell settings bridge',
)
