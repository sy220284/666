from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old = "domain.index('export function sortConstraints(', estimator_start)"
new = "domain.index('export function sortConstraints<', estimator_start)"
if text.count(old) != 1:
    raise SystemExit('generic sort boundary patch target not found')
script.write_text(text.replace(old, new, 1))
