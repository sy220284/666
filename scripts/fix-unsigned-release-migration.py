from pathlib import Path

path = Path('scripts/apply-unsigned-release-policy-v2.py')
text = path.read_text(encoding='utf-8')
old = '''old = "  const distributionTrust = readOption(\\n    '--distribution-trust',\\n    releaseKind === 'stable' ? 'required' : 'allow-unsigned',\\n  );\\n"\nif text.count(old) != 2:\n    raise SystemExit(f"release-tool default: expected 2 matches, found {text.count(old)}")\ntext = text.replace(old, "  const distributionTrust = readOption('--distribution-trust', 'allow-unsigned');\\n")\n'''
new = '''top_level_default = "  const distributionTrust = readOption(\\n    '--distribution-trust',\\n    releaseKind === 'stable' ? 'required' : 'allow-unsigned',\\n  );\\n"\nnested_default = "    const distributionTrust = readOption(\\n      '--distribution-trust',\\n      releaseKind === 'stable' ? 'required' : 'allow-unsigned',\\n    );\\n"\ntext = replace_once(\n    text,\n    top_level_default,\n    "  const distributionTrust = readOption('--distribution-trust', 'allow-unsigned');\\n",\n    "release-tool checksum default",\n)\ntext = replace_once(\n    text,\n    nested_default,\n    "    const distributionTrust = readOption('--distribution-trust', 'allow-unsigned');\\n",\n    "release-tool gate default",\n)\n'''
if text.count(old) != 1:
    raise SystemExit(f'fix migration: expected old release-tool patch block once, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Migration matcher fixed.')
