from pathlib import Path
import sys

root = Path(sys.argv[1])
contracts = root / 'm403-contracts-core.py'
text = contracts.read_text()
if not text.endswith("\n'''}"):
    raise SystemExit('contracts script trailing marker not found')
contracts.write_text(text[:-5] + '\n')

main_ui = root / 'm403-main-ui.py'
text = main_ui.read_text()
old = '''    "  ProjectActiveResultSchema,\\n",
    "  ProviderConnectionTestResultEnvelopeSchema,\\n  ProviderListCommandSchema,\\n  ProviderListResultSchema,\\n  ProviderRemoveCommandSchema,\\n  ProviderRemoveResultSchema,\\n  ProviderSaveCommandSchema,\\n  ProviderSummaryResultSchema,\\n  ProviderTestConnectionCommandSchema,\\n  ProjectActiveResultSchema,\\n",
'''
new = '''    "  PROTOCOL_VERSION,\\n  ProjectActiveResultSchema,\\n",
    "  PROTOCOL_VERSION,\\n  ProviderConnectionTestResultEnvelopeSchema,\\n  ProviderListCommandSchema,\\n  ProviderListResultSchema,\\n  ProviderRemoveCommandSchema,\\n  ProviderRemoveResultSchema,\\n  ProviderSaveCommandSchema,\\n  ProviderSummaryResultSchema,\\n  ProviderTestConnectionCommandSchema,\\n  ProjectActiveResultSchema,\\n",
'''
if text.count(old) != 1:
    raise SystemExit(f'preload import patch target count: {text.count(old)}')
main_ui.write_text(text.replace(old, new, 1))
