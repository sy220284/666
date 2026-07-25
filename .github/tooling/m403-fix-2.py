from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old = '''    "  ProjectRemoveRecentCommandSchema,\\n",
    "  ProjectRemoveRecentCommandSchema,\\n  ProviderListCommandSchema,\\n  ProviderSaveCommandSchema,\\n  ProviderRemoveCommandSchema,\\n  ProviderTestConnectionCommandSchema,\\n",
    'registered provider commands',
'''
new = '''    "  ProjectRemoveRecentCommandSchema,\\n  ProjectGetActiveCommandSchema,\\n",
    "  ProjectRemoveRecentCommandSchema,\\n  ProviderListCommandSchema,\\n  ProviderSaveCommandSchema,\\n  ProviderRemoveCommandSchema,\\n  ProviderTestConnectionCommandSchema,\\n  ProjectGetActiveCommandSchema,\\n",
    'registered provider commands',
'''
if text.count(old) != 1:
    raise SystemExit(f'registered command script target count: {text.count(old)}')
script.write_text(text.replace(old, new, 1))
