from pathlib import Path


path = Path('apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx')
source = path.read_text()
old = '    const parent = current.parentNode;'
new = '    const parent: ParentNode | null = current.parentNode;'
actual = source.count(old)
if actual != 1:
    raise SystemExit(f'parentNode type anchor count was {actual}')
path.write_text(source.replace(old, new, 1))
