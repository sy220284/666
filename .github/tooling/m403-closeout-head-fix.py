from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old = '379b8518b9c2b753dd4e22392c4221be648ffb4b'
new = '09a1da1e241d8edcd83723056b3c29b979205b24'
if text.count(old) != 1:
    raise SystemExit(f'implementation Head target count: {text.count(old)}')
script.write_text(text.replace(old, new, 1))
