import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type {
  ProviderConnectionTestResult,
  ProviderEditableConfig,
  ProviderSummary,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { RendererCommandCoordinator } from '../../runtime/command-coordinator.js';
import {
  confirmRegisteredUnsavedChanges,
  useUnsavedChangesGuard,
} from '../../runtime/unsaved-changes.js';
import {
  providerScopeLabel,
  refreshProviderSettings,
  runProviderSettingsCommand,
} from '../provider/provider-settings-controller.js';
import {
  applyProviderPreset,
  editableProviderConfig,
  PROVIDER_PRESETS,
  providerPreset,
  providerProtocolLabel,
  type ProviderPresetId,
} from './provider-presets.js';

export interface ProviderSettingsProps {
  readonly bridge: RendererBridgeAdapter;
  readonly onProvidersChanged: (providers: readonly ProviderSummary[]) => void;
  readonly onProviderConnectionVerified: (result: ProviderConnectionTestResult) => void;
  readonly onProviderInvalidated: (providerId: string) => void;
}

const EMPTY_CONFIG = applyProviderPreset('ollama');

export function ProviderSettings({
  bridge,
  onProvidersChanged,
  onProviderConnectionVerified,
  onProviderInvalidated,
}: ProviderSettingsProps) {
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [draft, setDraft] = useState<ProviderEditableConfig>(EMPTY_CONFIG);
  const [activePreset, setActivePreset] = useState<ProviderPresetId | null>('ollama');
  const [credential, setCredential] = useState('');
  const [removeCredential, setRemoveCredential] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('正在读取本机智能连接…');
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ProviderConnectionTestResult | null>(null);
  const { dirty, markDirty, clearDirty, confirmDiscard } = useUnsavedChangesGuard('智能连接设置');
  const commandCoordinator = useRef(new RendererCommandCoordinator()).current;
  const refreshInput = useMemo(
    () => ({ bridge, setProviders, onProvidersChanged, setMessage }),
    [bridge, onProvidersChanged],
  );

  useEffect(() => {
    void runProviderSettingsCommand({
      coordinator: commandCoordinator,
      pendingKey: 'load',
      setPending,
      setMessage,
      operation: (scope) => refreshProviderSettings(refreshInput, scope),
    });
    return () => {
      commandCoordinator.invalidateAll();
    };
  }, [commandCoordinator, refreshInput]);

  const applyPreset = (presetId: ProviderPresetId): void => {
    setDraft(applyProviderPreset(presetId));
    setActivePreset(presetId);
    setCredential('');
    setRemoveCredential(false);
    setDeleteArmed(null);
    setTestResult(null);
    setMessage(`${providerPreset(presetId).label}预设已填入，请确认模型名称后保存。`);
  };

  const choosePreset = async (presetId: ProviderPresetId): Promise<void> => {
    if (dirty && !(await confirmDiscard('切换智能连接预设'))) return;
    applyPreset(presetId);
    markDirty();
  };

  const edit = async (provider: ProviderSummary): Promise<void> => {
    if (dirty && !(await confirmDiscard('编辑其他智能连接'))) return;
    setDraft(editableProviderConfig(provider));
    setActivePreset(null);
    setCredential('');
    setRemoveCredential(false);
    setTestResult(null);
    setMessage(`正在编辑“${provider.name}”；密钥不会回显。`);
  };

  const reset = async (): Promise<void> => {
    if (dirty && !(await confirmDiscard('新建本机连接'))) return;
    applyPreset('ollama');
    markDirty();
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await runProviderSettingsCommand({
      coordinator: commandCoordinator,
      pendingKey: 'save',
      setPending,
      setMessage,
      operation: async (scope) => {
        setTestResult(null);
        const outcome = await bridge.providers.save({
          config: draft,
          credential: credential
            ? { action: 'replace', credential }
            : removeCredential
              ? { action: 'remove' }
              : { action: 'preserve' },
        });
        if (!scope.isCurrent()) return;
        setCredential('');
        setRemoveCredential(false);
        if (outcome.state === 'success') {
          clearDirty();
          onProviderInvalidated(outcome.data.id);
          setDraft(editableProviderConfig(outcome.data));
          await refreshProviderSettings(refreshInput, scope);
          if (scope.isCurrent())
            setMessage(`已保存“${outcome.data.name}”。实际密钥仅保存在系统安全存储。`);
        } else if (outcome.state === 'failure') {
          setMessage(authorErrorSummary(outcome.error));
        }
      },
    });
  };

  const remove = async (provider: ProviderSummary): Promise<void> => {
    if (deleteArmed !== provider.id) {
      setDeleteArmed(provider.id);
      setMessage(`再次点击删除“${provider.name}”以确认。`);
      return;
    }
    if (
      draft.id === provider.id &&
      dirty &&
      !(await confirmRegisteredUnsavedChanges('删除正在编辑的智能连接'))
    ) {
      setMessage('已保留当前智能连接的未保存修改。');
      return;
    }
    await runProviderSettingsCommand({
      coordinator: commandCoordinator,
      pendingKey: `remove:${provider.id}`,
      setPending,
      setMessage,
      operation: async (scope) => {
        const outcome = await bridge.providers.remove(provider.id);
        if (!scope.isCurrent()) return;
        setDeleteArmed(null);
        if (outcome.state === 'success') {
          onProviderInvalidated(provider.id);
          if (draft.id === provider.id) {
            clearDirty();
            applyPreset('ollama');
          }
          await refreshProviderSettings(refreshInput, scope);
          if (scope.isCurrent())
            setMessage(
              outcome.data.removed
                ? `已删除“${provider.name}”及其密钥引用。`
                : '该智能连接已不存在。',
            );
        } else if (outcome.state === 'failure') {
          setMessage(authorErrorSummary(outcome.error));
        }
      },
    });
  };

  const test = async (provider: ProviderSummary): Promise<void> => {
    await runProviderSettingsCommand({
      coordinator: commandCoordinator,
      pendingKey: `test:${provider.id}`,
      setPending,
      setMessage,
      operation: async (scope) => {
        setTestResult(null);
        setMessage(`正在测试“${provider.name}”…`);
        const outcome = await bridge.providers.testConnection(provider.id, { mode: 'replace' });
        if (!scope.isCurrent()) return;
        if (outcome.state === 'success') {
          setTestResult(outcome.data);
          onProviderConnectionVerified(outcome.data);
          setMessage(`连接成功：${outcome.data.actualModel}，${outcome.data.latencyMs}毫秒。`);
        } else if (outcome.state === 'failure') {
          setMessage(authorErrorSummary(outcome.error));
        }
      },
    });
  };

  const presetHint = activePreset
    ? providerPreset(activePreset).credentialHint
    : '编辑已有智能连接时，留空密钥即可保持原值。';

  return (
    <section
      className="react-settings-form"
      data-provider-settings
      data-settings-section="providers"
      data-unsaved={dirty ? 'true' : 'false'}
    >
      <header>
        <h2>智能服务与连接</h2>
        <p>选择常用服务后只需确认模型和密钥。连接不可用不会影响写作、搜索、版本、恢复或导出。</p>
      </header>
      <p aria-live="polite" data-provider-status role="status">
        {message}
      </p>
      <div className="provider-preset-grid" data-provider-presets>
        {PROVIDER_PRESETS.map((preset) => (
          <button
            aria-pressed={activePreset === preset.id}
            className="provider-preset-card"
            data-provider-preset={preset.id}
            disabled={Boolean(pending)}
            key={preset.id}
            type="button"
            onClick={() => choosePreset(preset.id)}
          >
            <strong>{preset.label}</strong>
            <span>{preset.description}</span>
          </button>
        ))}
      </div>
      <div className="provider-settings-grid">
        <form data-provider-form onSubmit={(event) => void save(event)}>
          <label>
            <span>连接名称</span>
            <input
              required
              data-provider-name
              value={draft.name}
              onChange={(event) => {
                markDirty();
                setDraft({ ...draft, name: event.target.value });
              }}
            />
          </label>
          <label>
            <span>模型名称</span>
            <input
              required
              data-provider-model
              placeholder="填写服务中实际可用的模型名称"
              value={draft.model}
              onChange={(event) => {
                markDirty();
                setDraft({ ...draft, model: event.target.value });
              }}
            />
          </label>
          <label>
            <span>API密钥</span>
            <input
              autoComplete="new-password"
              data-provider-credential
              placeholder="本机无密钥服务可留空"
              type="password"
              value={credential}
              onChange={(event) => {
                markDirty();
                setCredential(event.target.value);
              }}
            />
            <small>{presetHint}</small>
          </label>
          <details className="provider-advanced-settings">
            <summary>高级连接设置</summary>
            <label>
              <span>内部名称</span>
              <input
                required
                data-provider-id
                disabled={providers.some((provider) => provider.id === draft.id)}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                value={draft.id}
                onChange={(event) => {
                  markDirty();
                  setDraft({ ...draft, id: event.target.value });
                }}
              />
            </label>
            <label>
              <span>接口类型</span>
              <select
                data-provider-protocol
                value={draft.protocol}
                onChange={(event) => {
                  markDirty();
                  const protocol = event.target.value as 'openai_compatible' | 'anthropic';
                  setDraft(
                    protocol === 'anthropic'
                      ? {
                          ...draft,
                          protocol,
                          options: { anthropicVersion: '2023-06-01' },
                        }
                      : { ...draft, protocol, options: {} },
                  );
                }}
              >
                <option value="openai_compatible">OpenAI兼容接口</option>
                <option value="anthropic">Anthropic原生接口</option>
              </select>
            </label>
            <label>
              <span>服务地址</span>
              <input
                required
                data-provider-base-url
                type="url"
                value={draft.baseUrl}
                onChange={(event) => {
                  markDirty();
                  setDraft({ ...draft, baseUrl: event.target.value });
                }}
              />
            </label>
            <label>
              <span>单次请求等待时间（毫秒）</span>
              <input
                data-provider-timeout
                max={300_000}
                min={1_000}
                step={1_000}
                type="number"
                value={draft.timeoutMs}
                onChange={(event) => {
                  markDirty();
                  setDraft({ ...draft, timeoutMs: Number(event.target.value) });
                }}
              />
            </label>
            <label className="react-switch-row">
              <input
                checked={removeCredential}
                data-provider-remove-credential
                type="checkbox"
                onChange={(event) => {
                  markDirty();
                  setRemoveCredential(event.target.checked);
                }}
              />
              <span>保存时清除已有密钥</span>
            </label>
          </details>
          <footer>
            <button
              className="quiet-button"
              disabled={Boolean(pending)}
              type="button"
              onClick={reset}
            >
              新建本机连接
            </button>
            <button
              className="primary-button"
              data-provider-save
              disabled={Boolean(pending)}
              type="submit"
            >
              {pending === 'save' ? '正在保存…' : '保存智能连接'}
            </button>
          </footer>
        </form>
        <div data-provider-list>
          {providers.length === 0 ? <p>暂无智能连接。</p> : null}
          {providers.map((provider) => (
            <article className="feature-card" data-provider-card={provider.id} key={provider.id}>
              <h3>{provider.name}</h3>
              <p>
                {providerProtocolLabel(provider.protocol)} · {provider.model}
              </p>
              <p>
                {providerScopeLabel(provider.endpoint.scope)} ·{' '}
                {provider.endpoint.secureTransport ? '加密连接' : '未加密连接'}
              </p>
              <p>{provider.credentialConfigured ? '已配置密钥' : '未配置密钥'}</p>
              {provider.endpoint.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <details>
                <summary>连接详情</summary>
                <p>{provider.baseUrl}</p>
              </details>
              <footer>
                <button
                  className="quiet-button"
                  disabled={Boolean(pending) || provider.protocol === 'custom'}
                  type="button"
                  onClick={() => edit(provider)}
                >
                  {provider.protocol === 'custom' ? '历史配置只读' : '编辑'}
                </button>
                <button
                  className="primary-button"
                  data-provider-test={provider.id}
                  disabled={Boolean(pending) || provider.protocol === 'custom'}
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
            <dt>连接范围</dt>
            <dd>{providerScopeLabel(testResult.endpoint.scope)}</dd>
          </div>
          <div>
            <dt>模型列表</dt>
            <dd>{testResult.modelList === 'verified' ? '已验证' : '服务未提供'}</dd>
          </div>
          <div>
            <dt>流式输出</dt>
            <dd>{testResult.streaming ? '通过' : '未通过'}</dd>
          </div>
          <div>
            <dt>结构化输出</dt>
            <dd>{testResult.structuredOutput ? '通过' : '未通过'}</dd>
          </div>
          <div>
            <dt>用量统计</dt>
            <dd>{testResult.tokenUsageAvailable ? '服务返回' : '使用本地估算'}</dd>
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
