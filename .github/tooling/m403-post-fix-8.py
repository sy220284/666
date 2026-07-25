from pathlib import Path

path = Path('apps/desktop/renderer/src/features/settings/provider-settings.tsx')
text = path.read_text()
old_save = """      setMessage(`已保存“${outcome.data.name}”。实际密钥仅保存在系统安全存储。`);
      await refresh();
"""
new_save = """      await refresh();
      setMessage(`已保存“${outcome.data.name}”。实际密钥仅保存在系统安全存储。`);
"""
if text.count(old_save) != 1:
    raise SystemExit(f'save feedback target count: {text.count(old_save)}')
text = text.replace(old_save, new_save, 1)
old_remove = """      setMessage(outcome.data.removed ? `已删除“${provider.name}”及其凭据引用。` : '配置已不存在。');
      await refresh();
"""
new_remove = """      await refresh();
      setMessage(outcome.data.removed ? `已删除“${provider.name}”及其凭据引用。` : '配置已不存在。');
"""
if text.count(old_remove) != 1:
    raise SystemExit(f'remove feedback target count: {text.count(old_remove)}')
path.write_text(text.replace(old_remove, new_remove, 1))
