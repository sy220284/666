import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const defaultConfigPath = 'tests/e2e/playwright.config.ts';
const platformExperienceSpec = 'tests/e2e/platform-experience.spec.ts';
const platformExperienceConfigPath = 'tests/e2e/playwright.platform-experience.config.ts';

export function resolveElectronE2EInvocation({
  platform,
  display,
  xvfbAvailable,
  pnpmCommand,
  configPath = defaultConfigPath,
  additionalArguments = [],
}) {
  const playwrightArguments = [
    'exec',
    'playwright',
    'test',
    '--config',
    configPath,
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

export function resolveElectronE2ESpawnOptions(platform) {
  return {
    shell: platform === 'win32',
  };
}

function hasXvfb() {
  const probe = spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' });
  return !probe.error && probe.status === 0;
}

export function parseRunnerArguments(argumentsList) {
  const ciOnly = argumentsList.includes('--ci-only');
  const playwrightArguments = argumentsList.filter((argument) => argument !== '--ci-only');
  return {
    ciOnly,
    configPath: playwrightArguments.includes(platformExperienceSpec)
      ? platformExperienceConfigPath
      : defaultConfigPath,
    playwrightArguments,
  };
}

function run() {
  const { ciOnly, configPath, playwrightArguments } = parseRunnerArguments(process.argv.slice(2));
  if (ciOnly && process.env.CI !== 'true') {
    process.stdout.write('Electron E2E skipped outside CI.\n');
    return;
  }

  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  let invocation;
  try {
    invocation = resolveElectronE2EInvocation({
      platform: process.platform,
      display: process.env.DISPLAY,
      xvfbAvailable: process.platform !== 'linux' || Boolean(process.env.DISPLAY) || hasXvfb(),
      pnpmCommand,
      configPath,
      additionalArguments: playwrightArguments,
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }

  const result = spawnSync(invocation.command, invocation.arguments, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      WORLDFORGE_E2E_OUTPUT_DIR: process.env.WORLDFORGE_E2E_OUTPUT_DIR ?? 'test-results/electron',
    },
    stdio: 'inherit',
    ...resolveElectronE2ESpawnOptions(process.platform),
  });
  if (result.error) {
    const code = 'code' in result.error ? ` (${String(result.error.code)})` : '';
    process.stderr.write(
      `E2E_RUNNER_FAILED: Playwright Electron could not be started${code}: ${result.error.message}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
