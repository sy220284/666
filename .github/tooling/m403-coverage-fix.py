from pathlib import Path
import subprocess

path = Path('tests/security/provider-branch-coverage.test.ts')
text = path.read_text()
old = "    warnings: ['请求仅发送到当前设备上的用户配置服务。'],\n"
new = """    warnings: [
      '请求仅发送到当前设备上的用户配置服务。',
      '当前连接未使用TLS，仅允许本机或受信局域网端点。',
    ],
"""
if text.count(old) != 1:
    raise SystemExit(f'warning fixture target count: {text.count(old)}')
path.write_text(text.replace(old, new, 1))
subprocess.run(['pnpm', 'exec', 'prettier', '--write', str(path)], check=True)
subprocess.run(['pnpm', 'test:prepare'], check=True)
subprocess.run(['pnpm', 'exec', 'vitest', 'run', str(path)], check=True)
subprocess.run(['pnpm', 'test:coverage'], check=True)
subprocess.run(['pnpm', 'exec', 'prettier', '--check', str(path)], check=True)
subprocess.run(['git', 'diff', '--check'], check=True)
subprocess.run(['git', 'add', str(path)], check=True)
subprocess.run(['git', 'commit', '-m', '测试：修正Provider覆盖回归与格式'], check=True)
subprocess.run(['git', 'push', 'origin', 'HEAD:work/m4-03-provider-credential-connection'], check=True)
