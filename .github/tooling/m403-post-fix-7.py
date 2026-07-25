from pathlib import Path
import sys

finalize = Path(sys.argv[1])
text = finalize.read_text()
old = """    [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'provider-settings.spec.ts',
        '--config=tests/e2e/playwright.config.ts',
    ],
"""
new = """    [
        'xvfb-run',
        '--auto-servernum',
        'pnpm',
        'exec',
        'playwright',
        'test',
        'provider-settings.spec.ts',
        '--config=tests/e2e/playwright.config.ts',
    ],
"""
if text.count(old) != 1:
    raise SystemExit(f'electron xvfb command target count: {text.count(old)}')
finalize.write_text(text.replace(old, new, 1))
