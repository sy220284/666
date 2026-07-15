import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

export function resolveElectronE2EInvocation({
  platform,
  display,
  xvfbAvailable,
  pnpmCommand,
  additionalArguments = [],
}) {
  const playwrightArguments = [
    'exec',
    'playwright',
    'test',
    '--config',
    'tests/e2e/playwright.config.ts',
    ...additionalArguments,
  ];
  if (platform === 'linux' && !display) {
    if (!xvfbAvailable) {
      throw new Error('E2E_DISPLAY_UNAVAILABLE: Linux Electron E2E requires DISPLAY or xvfb-run.');
    }
    return { command: 'xvfb-run', arguments: ['-a', pnpmCommand, ...playwrightArguments] };
  }
  return { command: pnpmCommand, arguments: playwrightArguments };
}

function hasXvfb() {
  const probe = spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' });
  return !probe.error && probe.status === 0;
}

function run() {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  let invocation;
  try {
    invocation = resolveElectronE2EInvocation({
      platform: process.platform,
      display: process.env.DISPLAY,
      xvfbAvailable: process.platform !== 'linux' || Boolean(process.env.DISPLAY) || hasXvfb(),
      pnpmCommand,
      additionalArguments: process.argv.slice(2),
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }

  const result = spawnSync(invocation.command, invocation.arguments, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      WORLDFORGE_E2E_OUTPUT_DIR: process.env.WORLDFORGE_E2E_OUTPUT_DIR ?? 'test-results/electron',
    },
    stdio: 'inherit',
  });
  if (result.error) {
    process.stderr.write('E2E_RUNNER_FAILED: Playwright Electron could not be started.\n');
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
