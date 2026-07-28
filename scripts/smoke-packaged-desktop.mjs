import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

function option(argumentsList, name) {
  const index = argumentsList.indexOf(name);
  if (index < 0 || !argumentsList[index + 1]) throw new Error(`${name} is required`);
  return argumentsList[index + 1];
}

function extractArchive(platform, archivePath, targetDirectory) {
  const command =
    platform === 'macos'
      ? ['ditto', ['-x', '-k', archivePath, targetDirectory]]
      : platform === 'windows'
        ? ['tar.exe', ['-xf', archivePath, '-C', targetDirectory]]
        : ['tar', ['-xzf', archivePath, '-C', targetDirectory]];
  const result = spawnSync(command[0], command[1], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Packaged smoke extraction failed: ${result.stderr || result.error?.message || 'unknown'}`,
    );
  }
}

export function packagedExecutablePath(root, manifest) {
  if (manifest.platform === 'macos') {
    return path.join(root, 'WorldForge.app', 'Contents', 'MacOS', 'WorldForge');
  }
  const bundle = path.join(
    root,
    `WorldForge-v${manifest.version}-${manifest.platform}-${manifest.architecture}`,
  );
  return path.join(bundle, manifest.platform === 'windows' ? 'WorldForge.exe' : 'worldforge');
}

export function waitForPackagedReady(child, timeoutMs = 25_000) {
  return new Promise((resolve, reject) => {
    let standardOutput = '';
    let standardError = '';
    const finish = (callback) => {
      clearTimeout(timer);
      child.stdout?.off('data', onStandardOutput);
      child.stderr?.off('data', onStandardError);
      child.off('error', onError);
      child.off('exit', onExit);
      callback();
    };
    const onStandardOutput = (chunk) => {
      standardOutput = `${standardOutput}${String(chunk)}`.slice(-32_768);
      if (standardOutput.includes('WORLDFORGE_PACKAGED_READY')) {
        finish(() => resolve({ standardOutput, standardError }));
      }
    };
    const onStandardError = (chunk) => {
      standardError = `${standardError}${String(chunk)}`.slice(-32_768);
    };
    const onError = (error) => {
      finish(() => reject(error));
    };
    const onExit = (code, signal) => {
      finish(() =>
        reject(
          new Error(
            `Packaged WorldForge exited before ready: code=${code ?? 'none'} signal=${signal ?? 'none'}\n${standardError}`,
          ),
        ),
      );
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Packaged WorldForge startup timed out.\n${standardError}`)));
    }, timeoutMs);
    child.stdout?.on('data', onStandardOutput);
    child.stderr?.on('data', onStandardError);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

async function terminate(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

export async function smokePackagedDesktop(
  argumentsList = process.argv.slice(2),
  repositoryRoot = process.cwd(),
) {
  const platform = option(argumentsList, '--platform');
  const directory = path.resolve(repositoryRoot, option(argumentsList, '--directory'));
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'package-manifest.json'), 'utf8'),
  );
  if (manifest.platform !== platform) {
    throw new Error('Packaged smoke platform does not match package manifest');
  }

  const extractionDirectory = await mkdtemp(path.join(tmpdir(), 'worldforge-package-smoke-'));
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-package-user-data-'));
  let application;
  try {
    extractArchive(platform, path.join(directory, manifest.artifact), extractionDirectory);
    const executable = packagedExecutablePath(extractionDirectory, manifest);
    application = spawn(executable, process.getuid?.() === 0 ? ['--no-sandbox'] : [], {
      env: {
        ...process.env,
        WORLDFORGE_E2E: '1',
        WORLDFORGE_E2E_USER_DATA: userDataPath,
        WORLDFORGE_PACKAGED_SMOKE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForPackagedReady(application);
    const result = {
      product: manifest.product,
      coreStatus: 'healthy',
      rendererReady: 'true',
    };
    if (result.product !== 'WorldForge') {
      throw new Error(`Packaged smoke failed: ${JSON.stringify(result)}`);
    }
    process.stdout.write(
      `Packaged WorldForge ${manifest.version} started successfully on ${platform}.\n`,
    );
    return result;
  } finally {
    await terminate(application);
    await Promise.all([
      rm(extractionDirectory, { recursive: true, force: true }),
      rm(userDataPath, { recursive: true, force: true }),
    ]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await smokePackagedDesktop();
}
