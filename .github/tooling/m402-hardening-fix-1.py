from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old = "domain = replace_once(domain, old_estimator, new_estimator, 'token estimator')"
new = """estimator_start = domain.index('export function estimateConstraintTokens(')
estimator_end = domain.index('export function sortConstraints(', estimator_start)
domain = domain[:estimator_start] + new_estimator + '\\n' + domain[estimator_end:]"""
if text.count(old) != 1:
    raise SystemExit('token estimator patch call not found')
script.write_text(text.replace(old, new, 1))
