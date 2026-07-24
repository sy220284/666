from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
if text.count('ConstraintHashSchema') < 4:
    raise SystemExit('constraint hash schema rename targets not found')
script.write_text(text.replace('ConstraintHashSchema', 'ConstraintPackageHashSchema'))
