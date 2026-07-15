import { spawnSync } from 'node:child_process';
import process from 'node:process';

if (process.env.CI === 'true') {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(pnpmCommand, ['test:e2e'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}
