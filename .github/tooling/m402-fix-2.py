from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
marker = "subprocess.run(['pnpm', 'exec', 'vitest', 'run', 'tests/unit/constraint-package-domain.test.ts', 'tests/integration/constraint-package.test.ts'], check=True)"
replacement = "subprocess.run(['pnpm', 'test:prepare'], check=True)\n" + marker
if text.count(marker) != 1:
    raise SystemExit('test execution marker not found')
script.write_text(text.replace(marker, replacement, 1))
