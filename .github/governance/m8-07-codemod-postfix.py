from pathlib import Path

path = Path('apps/desktop/renderer/src/features/writing/writing-workbench.tsx')
text = path.read_text(encoding='utf-8')
needle = '  readonly disclosureMode: AppDisclosureMode;\n'
first = text.find(needle)
second = text.find(needle, first + len(needle)) if first >= 0 else -1
if first < 0:
    raise SystemExit('primary disclosureMode prop was not generated')
if second >= 0:
    text = text[:second] + text[second + len(needle):]
path.write_text(text, encoding='utf-8')
