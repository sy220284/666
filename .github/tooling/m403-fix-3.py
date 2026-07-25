from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
block_one = '''replace_once(
    'apps/desktop/renderer/src/features/settings/settings-page.tsx',
    "    availability: { general: true, editor: true, appearance: true, advanced: true },\\n",
    "    availability: { general: true, editor: true, appearance: true, providers: true, advanced: true },\\n",
    'settings provider availability one',
)
'''
block_two = '''replace_once(
    'apps/desktop/renderer/src/features/settings/settings-page.tsx',
    "      availability: { general: true, editor: true, appearance: true, advanced: true },\\n",
    "      availability: { general: true, editor: true, appearance: true, providers: true, advanced: true },\\n",
    'settings provider availability two',
)
'''
if text.count(block_one) != 1 or text.count(block_two) != 1:
    raise SystemExit('settings availability script blocks not found')
replacement = '''settings_path = Path('apps/desktop/renderer/src/features/settings/settings-page.tsx')
settings_text = settings_path.read_text()
old_availability = 'availability: { general: true, editor: true, appearance: true, advanced: true },'
if settings_text.count(old_availability) != 2:
    raise SystemExit(f'settings provider availability count: {settings_text.count(old_availability)}')
settings_path.write_text(
    settings_text.replace(
        old_availability,
        'availability: { general: true, editor: true, appearance: true, providers: true, advanced: true },',
    )
)
'''
script.write_text(text.replace(block_one, replacement, 1).replace(block_two, '', 1))
