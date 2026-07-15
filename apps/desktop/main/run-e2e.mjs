import { spawnSync } from 'node:child_process';
import process from 'node:process';

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const playwrightArguments = [
  'exec',
  'playwright',
  'test',
  '--config',
  'tests/e2e/playwright.config.ts',
];

let command = pnpmCommand;
let commandArguments = playwrightArguments;

if (process.platform === 'linux' && !process.env.DISPLAY) {
  const xvfb = spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' });
  if (xvfb.error || xvfb.status !== 0) {
    process.stderr.write(
      'E2E_DISPLAY_UNAVAILABLE: Linux Electron E2E requires DISPLAY or xvfb-run.\n',
    );
    process.exit(2);
  }
  command = 'xvfb-run';
  commandArguments = ['-a', pnpmCommand, ...playwrightArguments];
}

const result = spawnSync(command, commandArguments, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  process.stderr.write('E2E_RUNNER_FAILED: Playwright could not be started.\n');
  process.exit(1);
}

process.exit(result.status ?? 1);
