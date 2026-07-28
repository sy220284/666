import { useEffect, useState, type FormEvent } from 'react';

import type {
  ProviderConnectionTestResult,
  ProviderEditableConfig,
  ProviderEndpointScope,
  ProviderSummary,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

export interface ProviderSettingsProps {
  readonly bridge: RendererBridgeAdapter;
  readonly onProvidersChanged: (providers: readonly ProviderSummary[]) => void;
  readonly onProviderConnectionVerified: (result: ProviderConnectionTestResult) => void;
  readonly onProviderInvalidated: (providerId: string) => void;
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

export function ProviderSettings({
  bridge,
  onProvidersChanged,
  onProviderConnectionVerified,
  onProviderInvalidated,
}: ProviderSettingsProps) {
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [draft, setDraft] = useState<ProviderEditableConfig>(EMPTY_CONFIG);
  const [credential, setCredential] = useState('');
  const [removeCredential, setRemoveCredential] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('正在读取本机Provider配置…');
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ProviderConnectionTestResult | null>(null);

  const refresh = async (): Promise<void> => {
    const outcome = await bridge.providers.list({ mode: 'replace' });
    if (outcome.state === 'success') {
      setProviders(outcome.data.providers);
      onProvidersChanged(outcome.data.providers);
      setMessage(
        outcome.data.providers.length ? nullMessage() : '尚未配置AI服务；离线写作功能不受影响。',
      );
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
      onProviderInvalidated(outcome.data.id);
      setDraft({
        id: outcome.data.id,
        name: outcome.data.name,
        protocol: outcome.data.protocol,
        baseUrl: outcome.data.baseUrl,
        model: outcome.data.model,
        timeoutMs: outcome.data.timeoutMs,
        options: outcome.data.options,
      });
      await refresh();
      setMessage(`已保存“${outcome.data.name}”。实际密钥仅保存在系统安全存储。`);
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
      onProviderInvalidated(provider.id);
      if (draft.id === provider.id) reset();
      await refresh();
      setMessage(
        outcome.data.removed ? `已删除“${provider.name}”及其凭据引用。` : '配置已不存在。',
      );
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
      onProviderConnectionVerified(outcome.data);
      setMessage(`连接成功：${outcome.data.actualModel}，${outcome.data.latencyMs}ms。`);
    } else if (outcome.state === 'failure') {
      setMessage(`${outcome.error.message}（${outcome.error.code}）`);
    }
  };

  return (
    <section
      className="react-settings-form"
      data-provider-settings
      data-settings-section="providers"
    >
      <header>
        <h2>AI服务与连接</h2>
        <p>
          Provider不可用不会影响写作、版本、搜索、恢复或导出。密钥只进入系统安全存储和单次请求内存。
        </p>
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
            <button
              className="quiet-button"
              disabled={Boolean(pending)}
              type="button"
              onClick={reset}
            >
              新建
            </button>
            <button
              className="primary-button"
              data-provider-save
              disabled={Boolean(pending)}
              type="submit"
            >
              {pending === 'save' ? '正在保存…' : '保存配置'}
            </button>
          </footer>
        </form>
        <div data-provider-list>
          {providers.length === 0 ? <p>暂无Provider配置。</p> : null}
          {providers.map((provider) => (
            <article className="feature-card" data-provider-card={provider.id} key={provider.id}>
              <h3>{provider.name}</h3>
              <p>
                {provider.protocol} · {provider.model}
              </p>
              <p>{provider.baseUrl}</p>
              <p>
                {scopeLabel(provider.endpoint.scope)} ·{' '}
                {provider.endpoint.secureTransport ? 'TLS' : '未使用TLS'}
              </p>
              <p>{provider.credentialConfigured ? '已配置密钥' : '无密钥'}</p>
              {provider.endpoint.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <footer>
                <button
                  className="quiet-button"
                  disabled={Boolean(pending)}
                  type="button"
                  onClick={() => edit(provider)}
                >
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
          <div>
            <dt>网络边界</dt>
            <dd>{scopeLabel(testResult.endpoint.scope)}</dd>
          </div>
          <div>
            <dt>模型列表</dt>
            <dd>{testResult.modelList === 'verified' ? '已验证' : '端点不支持'}</dd>
          </div>
          <div>
            <dt>流式</dt>
            <dd>{testResult.streaming ? '通过' : '未通过'}</dd>
          </div>
          <div>
            <dt>结构化输出</dt>
            <dd>{testResult.structuredOutput ? '通过' : '未通过'}</dd>
          </div>
          <div>
            <dt>Token统计</dt>
            <dd>{testResult.tokenUsageAvailable ? 'Provider返回' : '需要本地估算'}</dd>
          </div>
          {testResult.warnings.map((warning) => (
            <div key={warning}>
              <dt>提示</dt>
              <dd>{warning}</dd>
            </div>
          ))}
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
