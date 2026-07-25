from pathlib import Path

contracts = Path('packages/contracts/src/index.ts')
text = contracts.read_text()
for line in [
    '  ProviderConnectionTestResultEnvelopeSchema,\n',
    '  ProviderListResultSchema,\n',
    '  ProviderRemoveResultSchema,\n',
    '  ProviderSummaryResultSchema,\n',
]:
    if text.count(line) != 1:
        raise SystemExit(f'contracts unused import target count for {line.strip()}: {text.count(line)}')
    text = text.replace(line, '', 1)
contracts.write_text(text)

main = Path('apps/desktop/main/src/ipc-handlers.ts')
text = main.read_text()
old = """    credential = null;
    if (!result.ok) return providerFailure(requestId, result.errorCode);
"""
new = """    if (!result.ok) return providerFailure(requestId, result.errorCode);
"""
if text.count(old) != 1:
    raise SystemExit(f'credential cleanup assignment target count: {text.count(old)}')
main.write_text(text.replace(old, new, 1))
