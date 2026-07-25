from pathlib import Path

path = Path('packages/contracts/src/provider.ts')
text = path.read_text()
old = """export const PROVIDER_IPC_CHANNELS = {
  list: 'worldforge:provider:list',
  save: 'worldforge:provider:save',
  remove: 'worldforge:provider:remove',
  testConnection: 'worldforge:provider:test-connection',
} as const;

export const PROVIDER_COMMANDS = {
  list: 'ai.provider.list',
  save: 'ai.provider.save',
  remove: 'ai.provider.remove',
  testConnection: 'ai.provider.testConnection',
} as const;
"""
new = """export const PROVIDER_IPC_CHANNELS = {
  providerList: 'worldforge:provider:list',
  providerSave: 'worldforge:provider:save',
  providerRemove: 'worldforge:provider:remove',
  providerTestConnection: 'worldforge:provider:test-connection',
} as const;

export const PROVIDER_COMMANDS = {
  providerList: 'ai.provider.list',
  providerSave: 'ai.provider.save',
  providerRemove: 'ai.provider.remove',
  providerTestConnection: 'ai.provider.testConnection',
} as const;
"""
if text.count(old) != 1:
    raise SystemExit(f'provider public command constant target count: {text.count(old)}')
path.write_text(text.replace(old, new, 1))
