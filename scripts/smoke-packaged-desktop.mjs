import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from '@playwright/test';

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

function executablePath(root, manifest) {
  if (manifest.platform === 'macos') {
    return path.join(root, 'WorldForge.app', 'Contents', 'MacOS', 'WorldForge');
  }
  const bundle = path.join(
    root,
    `WorldForge-v${manifest.version}-${manifest.platform}-${manifest.architecture}`,
  );
  return path.join(bundle, manifest.platform === 'windows' ? 'WorldForge.exe' : 'worldforge');
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
    const executable = executablePath(extractionDirectory, manifest);
    application = await electron.launch({
      executablePath: executable,
      args: process.getuid?.() === 0 ? ['--no-sandbox'] : [],
      env: {
        ...process.env,
        WORLDFORGE_E2E: '1',
        WORLDFORGE_E2E_USER_DATA: userDataPath,
      },
    });
    const window = await application.firstWindow({ timeout: 20_000 });
    const rendererRoot = window.locator('body[data-renderer-ready="true"]');
    await rendererRoot.waitFor({ state: 'attached', timeout: 20_000 });
    const coreStatus = await window.evaluate(async () => {
      const bridge = globalThis.worldforge;
      const status = await bridge.app.getCoreStatus();
      return status.ok ? status.data.status : status.error.code;
    });
    const result = {
      title: await window.title(),
      coreStatus,
      rendererReady: await rendererRoot.getAttribute('data-renderer-ready'),
    };
    if (
      result.title !== 'WorldForge' ||
      result.coreStatus !== 'healthy' ||
      result.rendererReady !== 'true'
    ) {
      throw new Error(`Packaged smoke failed: ${JSON.stringify(result)}`);
    }
    process.stdout.write(
      `Packaged WorldForge ${manifest.version} started successfully on ${platform}.\n`,
    );
    return result;
  } finally {
    await application?.close().catch(() => undefined);
    await Promise.all([
      rm(extractionDirectory, { recursive: true, force: true }),
      rm(userDataPath, { recursive: true, force: true }),
    ]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await smokePackagedDesktop();
}
