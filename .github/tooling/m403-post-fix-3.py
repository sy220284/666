from pathlib import Path

path = Path('packages/contracts/src/provider.ts')
text = path.read_text()
replacements = {
    'PROVIDER_COMMANDS.list': 'PROVIDER_COMMANDS.providerList',
    'PROVIDER_COMMANDS.save': 'PROVIDER_COMMANDS.providerSave',
    'PROVIDER_COMMANDS.remove': 'PROVIDER_COMMANDS.providerRemove',
    'PROVIDER_COMMANDS.testConnection': 'PROVIDER_COMMANDS.providerTestConnection',
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f'{old}: target count {text.count(old)}')
    text = text.replace(old, new, 1)
path.write_text(text)
