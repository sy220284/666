import type { ProviderEditableConfig, ProviderSummary } from '@worldforge/contracts';

export type ProviderPresetId =
  'ollama' | 'lm-studio' | 'openai-compatible' | 'anthropic' | 'custom';

export interface ProviderPreset {
  readonly id: ProviderPresetId;
  readonly label: string;
  readonly description: string;
  readonly credentialHint: string;
  readonly config: ProviderEditableConfig;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama（本机）',
    description: '连接当前设备上的Ollama兼容接口。',
    credentialHint: '通常无需密钥。请填写已在Ollama中安装的模型名称。',
    config: {
      id: 'ollama-local',
      name: 'Ollama（本机）',
      protocol: 'openai_compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: '',
      timeoutMs: 120_000,
      options: {},
    },
  },
  {
    id: 'lm-studio',
    label: 'LM Studio（本机）',
    description: '连接LM Studio默认的本机兼容接口。',
    credentialHint: '通常无需密钥。请先在LM Studio中加载模型并启动本地服务。',
    config: {
      id: 'lm-studio-local',
      name: 'LM Studio（本机）',
      protocol: 'openai_compatible',
      baseUrl: 'http://127.0.0.1:1234/v1',
      model: '',
      timeoutMs: 120_000,
      options: {},
    },
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI兼容服务',
    description: '适用于采用OpenAI兼容接口的网络或局域网服务。',
    credentialHint: '多数网络服务需要API密钥；模型名称以服务方提供的信息为准。',
    config: {
      id: 'openai-compatible',
      name: 'OpenAI兼容服务',
      protocol: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: '',
      timeoutMs: 60_000,
      options: {},
    },
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: '连接Anthropic原生消息接口。',
    credentialHint: '需要API密钥；模型名称以服务方提供的信息为准。',
    config: {
      id: 'anthropic',
      name: 'Anthropic',
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      model: '',
      timeoutMs: 60_000,
      options: { anthropicVersion: '2023-06-01' },
    },
  },
  {
    id: 'custom',
    label: '自定义服务',
    description: '从空白配置开始，适用于其他兼容服务。',
    credentialHint: '请根据服务说明填写地址、模型和密钥。',
    config: {
      id: 'custom-service',
      name: '自定义AI服务',
      protocol: 'openai_compatible',
      baseUrl: 'https://',
      model: '',
      timeoutMs: 60_000,
      options: {},
    },
  },
];

export function providerPreset(id: ProviderPresetId): ProviderPreset {
  const preset = PROVIDER_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error('未知的AI连接预设。');
  return preset;
}

export function applyProviderPreset(id: ProviderPresetId): ProviderEditableConfig {
  return editableProviderConfig(providerPreset(id).config);
}

export function editableProviderConfig(
  config: ProviderEditableConfig | ProviderSummary,
): ProviderEditableConfig {
  const common = {
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
  };
  if (config.protocol === 'anthropic') {
    return { ...common, protocol: 'anthropic', options: { ...config.options } };
  }
  if (config.protocol === 'custom') {
    return { ...common, protocol: 'custom', options: {} };
  }
  return { ...common, protocol: 'openai_compatible', options: {} };
}

export function providerProtocolLabel(protocol: ProviderEditableConfig['protocol']): string {
  if (protocol === 'anthropic') return 'Anthropic原生接口';
  if (protocol === 'custom') return '历史自定义接口（只读）';
  return 'OpenAI兼容接口';
}
