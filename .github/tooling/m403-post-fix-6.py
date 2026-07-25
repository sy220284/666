from pathlib import Path
import sys

config = Path('tests/e2e/playwright.config.ts')
text = config.read_text()
old = "    'state-proposal-workflow.spec.ts',\n"
new = "    'state-proposal-workflow.spec.ts',\n    'provider-settings.spec.ts',\n"
if text.count(old) != 1:
    raise SystemExit(f'playwright testMatch target count: {text.count(old)}')
config.write_text(text.replace(old, new, 1))

finalize = Path(sys.argv[1])
text = finalize.read_text()
old = "        'tests/e2e/provider-settings.spec.ts',\n"
new = "        'provider-settings.spec.ts',\n"
if text.count(old) != 1:
    raise SystemExit(f'playwright CLI target count: {text.count(old)}')
finalize.write_text(text.replace(old, new, 1))
