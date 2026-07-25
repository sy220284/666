from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old = """for command in [
    ['pnpm', 'lint'],
    ['pnpm', 'typecheck'],
    ['pnpm', 'build'],
    ['pnpm', 'test'],
    ['pnpm', 'test:migration'],
    ['pnpm', 'test:integration'],
    ['pnpm', 'test:security'],
    ['pnpm', 'test:e2e'],
    ['pnpm', 'test:unit'],
    ['pnpm', 'test:eval'],
]:
    run(command)
run(['node', 'scripts/taskctl.mjs', 'validate'])
"""
new = """# The complete gate set already passed in workflow 30145351688 at code Head
# 09a1da1e241d8edcd83723056b3c29b979205b24. The only later formal-branch
# change is the user-directed M4-04 activation hold in known-risks.md.
verified_code_head = '09a1da1e241d8edcd83723056b3c29b979205b24'
changed = subprocess.check_output(
    ['git', 'diff', '--name-only', verified_code_head, IMPLEMENTATION_COMMIT],
    text=True,
).splitlines()
if changed != ['docs/test-evidence/M4-03/known-risks.md']:
    raise SystemExit(f'Unverified changes after full-gate Head: {changed}')
run(['node', 'scripts/taskctl.mjs', 'validate'])
"""
if text.count(old) != 1:
    raise SystemExit(f'full-gate reuse patch target count: {text.count(old)}')
script.write_text(text.replace(old, new, 1))
