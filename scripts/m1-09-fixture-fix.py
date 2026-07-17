#!/usr/bin/env python3
from pathlib import Path

path = Path('tests/integration/import-export-service.test.ts')
source = path.read_text(encoding='utf-8')
old = "Buffer.from('=== 第一章 ===\\n', 'ascii')"
new = "Buffer.from('=== Chapter 1 ===\\n', 'ascii')"
if old not in source:
    raise SystemExit('GB18030 fixture marker anchor missing')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
print('GB18030 fixture marker uses ASCII-only bytes')
