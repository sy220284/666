import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createPackage, getRawHeader } from '@electron/asar';
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import { resedit } from '@electron/packager/resedit';

import { parseReleaseVersion } from '../.github/governance/release-acceptance.mjs';

const root = process.cwd();
const require = createRequire(import.meta.url);
const platformByNode = Object.freeze({
  linux: 'linux',
  win32: 'windows',
  darwin: 'macos',
});
const supportedPlatforms = new Set(Object.values(platformByNode));
const supportedReleaseKinds = new Set(['draft', 'prerelease', 'stable']);
const supportedDistributionTrustModes = new Set(['allow-unsigned', 'required']);

function option(argumentsList, name) {
  const inlinePrefix = `${name}=`;
  const inline = argumentsList.find((argument) => argument.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = argumentsList.indexOf(name);
  if (index < 0) return null;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

export function packagePlatformForNode(nodePlatform) {
  const platform = platformByNode[nodePlatform];
  if (!platform) throw new Error(`Unsupported packaging host: ${nodePlatform}`);
  return platform;
}

export function parsePackageArguments(
  argumentsList,
  { packageVersion, nodePlatform = process.platform, repositoryRoot = root } = {},
) {
  argumentsList = argumentsList.filter((argument) => argument !== '--');
  const known = new Set([
    '--platform',
    '--version',
    '--output',
    '--release-kind',
    '--distribution-trust',
  ]);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const name = argument.includes('=') ? argument.slice(0, argument.indexOf('=')) : argument;
    if (!known.has(name)) throw new Error(`Unknown package option: ${argument}`);
    if (!argument.includes('=')) index += 1;
  }

  const hostPlatform = packagePlatformForNode(nodePlatform);
  const platform = option(argumentsList, '--platform') ?? hostPlatform;
  if (!supportedPlatforms.has(platform)) {
    throw new Error(`Unsupported package platform: ${platform}`);
  }
  if (platform !== hostPlatform) {
    throw new Error(
      `Cross-platform packaging is forbidden: host=${hostPlatform}, requested=${platform}`,
    );
  }

  const version = parseReleaseVersion(option(argumentsList, '--version') ?? packageVersion);
  if (packageVersion && version !== packageVersion) {
    throw new Error(
      `Package version ${version} does not match package.json version ${packageVersion}`,
    );
  }

  const releaseKind = option(argumentsList, '--release-kind') ?? 'draft';
  if (!supportedReleaseKinds.has(releaseKind)) {
    throw new Error(`Unsupported release kind: ${releaseKind}`);
  }
  const distributionTrust =
    option(argumentsList, '--distribution-trust') ??
    (releaseKind === 'stable' ? 'required' : 'allow-unsigned');
  if (!supportedDistributionTrustModes.has(distributionTrust)) {
    throw new Error(`Unsupported distribution trust mode: ${distributionTrust}`);
  }
  if (releaseKind === 'stable' && distributionTrust !== 'required') {
    throw new Error('Stable packages must require distribution trust');
  }

  const output = path.resolve(
    repositoryRoot,
    option(argumentsList, '--output') ?? path.join('release', platform),
  );
  const relative = path.relative(repositoryRoot, output);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Package output must be located inside the repository');
  }
  return { platform, hostPlatform, version, releaseKind, distributionTrust, output };
}

function run(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });
  if (result.error || result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${command} ${argumentsList.join(' ')} failed with exit ${result.status ?? 'unavailable'}${details ? `\n${details}` : ''}`,
      result.error ? { cause: result.error } : undefined,
    );
  }
  return result.stdout.trim();
}

async function requirePath(filePath, label) {
  try {
    await stat(filePath);
  } catch (error) {
    throw new Error(`${label} is missing: ${path.relative(root, filePath)}`, {
      cause: error,
    });
  }
}

function electronPackageRoot() {
  const packagePath = require.resolve('electron/package.json');
  return path.dirname(packagePath);
}

export function electronDistributionPath(packageRoot = electronPackageRoot()) {
  return path.join(packageRoot, 'dist');
}

export async function ensureElectronRuntime({
  packageRoot = electronPackageRoot(),
  nodeExecutable = process.execPath,
  environment = process.env,
  runCommand = run,
} = {}) {
  const distributionPath = electronDistributionPath(packageRoot);
  try {
    await stat(distributionPath);
    return distributionPath;
  } catch {
    const installerPath = path.join(packageRoot, 'install.js');
    await requirePath(installerPath, 'Electron installer');
    const installerEnvironment = { ...environment };
    delete installerEnvironment.ELECTRON_SKIP_BINARY_DOWNLOAD;
    runCommand(nodeExecutable, [installerPath], {
      cwd: packageRoot,
      env: installerEnvironment,
      stdio: 'inherit',
    });
    await requirePath(distributionPath, 'Electron runtime after installer execution');
    return distributionPath;
  }
}

async function deployWorkspace(packageName, target) {
  await mkdir(path.dirname(target), { recursive: true });
  const invocation = pnpmInvocation(workspaceDeployArguments(packageName, target));
  run(invocation.command, invocation.arguments);
  const [scope, name] = packageName.split('/');
  if (scope && name) {
    await rm(path.join(target, 'node_modules', '.pnpm', 'node_modules', scope, name), {
      force: true,
    });
  }
}

export function workspaceDeployArguments(packageName, target) {
  return [
    '--filter',
    packageName,
    'deploy',
    '--prod',
    '--config.inject-workspace-packages=true',
    '--config.node-linker=hoisted',
    target,
  ];
}

export function pnpmInvocation(
  argumentsList,
  {
    environment = process.env,
    nodeExecutable = process.execPath,
    nodePlatform = process.platform,
  } = {},
) {
  if (environment.npm_execpath) {
    return {
      command: nodeExecutable,
      arguments: [environment.npm_execpath, ...argumentsList],
    };
  }
  if (nodePlatform === 'win32') {
    throw new Error('PNPM_CLI_PATH_REQUIRED_ON_WINDOWS');
  }
  return { command: 'pnpm', arguments: argumentsList };
}

async function prepareApplication(resourcesPath, version) {
  const appRoot = path.join(resourcesPath, 'app');
  const mainTarget = path.join(appRoot, 'apps', 'desktop', 'main');
  const coreTarget = path.join(appRoot, 'packages', 'core-service');

  await deployWorkspace('@worldforge/main', mainTarget);
  await deployWorkspace('@worldforge/core-service', coreTarget);
  await Promise.all([
    cp(
      path.join(root, 'apps', 'desktop', 'preload', 'dist'),
      path.join(appRoot, 'apps', 'desktop', 'preload', 'dist'),
      { recursive: true },
    ),
    cp(
      path.join(root, 'apps', 'desktop', 'renderer', 'dist'),
      path.join(appRoot, 'apps', 'desktop', 'renderer', 'dist'),
      { recursive: true },
    ),
    cp(path.join(root, 'migrations'), path.join(resourcesPath, 'migrations'), {
      recursive: true,
    }),
  ]);
  await writeFile(
    path.join(appRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'worldforge',
        productName: 'WorldForge',
        version,
        private: true,
        type: 'module',
        main: 'apps/desktop/main/dist/electron-main.js',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function copyElectronRuntime(stagingDirectory, platform, version) {
  const electronDist = await ensureElectronRuntime();
  const architecture = process.arch;
  const bundleName = `WorldForge-v${version}-${platform}-${architecture}`;

  if (platform === 'macos') {
    const sourceApp = path.join(electronDist, 'Electron.app');
    const bundlePath = path.join(stagingDirectory, 'WorldForge.app');
    await requirePath(sourceApp, 'Electron macOS application');
    await cp(sourceApp, bundlePath, { recursive: true, verbatimSymlinks: true });
    const sourceExecutable = path.join(bundlePath, 'Contents', 'MacOS', 'Electron');
    const executablePath = path.join(bundlePath, 'Contents', 'MacOS', 'WorldForge');
    await rename(sourceExecutable, executablePath);
    const plistPath = path.join(bundlePath, 'Contents', 'Info.plist');
    const plist = await readFile(plistPath, 'utf8');
    const bundleVersion = version.split(/[+-]/u, 1)[0];
    await writeFile(
      plistPath,
      replacePlistString(
        replacePlistString(
          replacePlistString(
            plist
              .replaceAll('<string>Electron</string>', '<string>WorldForge</string>')
              .replaceAll('<string>electron</string>', '<string>worldforge</string>'),
            'CFBundleIdentifier',
            'com.worldforge.desktop',
          ),
          'CFBundleShortVersionString',
          bundleVersion,
        ),
        'CFBundleVersion',
        bundleVersion,
      ),
      'utf8',
    );
    return {
      architecture,
      bundleName: 'WorldForge.app',
      bundlePath,
      executablePath,
      plistPath,
      resourcesPath: path.join(bundlePath, 'Contents', 'Resources'),
    };
  }

  const bundlePath = path.join(stagingDirectory, bundleName);
  await cp(electronDist, bundlePath, { recursive: true, verbatimSymlinks: true });
  let executablePath;
  if (platform === 'windows') {
    executablePath = path.join(bundlePath, 'WorldForge.exe');
    await rename(path.join(bundlePath, 'electron.exe'), executablePath);
  } else {
    executablePath = path.join(bundlePath, 'worldforge');
    await rename(path.join(bundlePath, 'electron'), executablePath);
    await chmod(executablePath, 0o755);
  }
  return {
    architecture,
    bundleName,
    bundlePath,
    executablePath,
    plistPath: null,
    resourcesPath: path.join(bundlePath, 'resources'),
  };
}

export function replacePlistString(source, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*)<string>[^<]*</string>`, 'u');
  if (!pattern.test(source)) throw new Error(`macOS Info.plist is missing ${key}`);
  return source.replace(pattern, `$1<string>${value}</string>`);
}

export function asarHeaderIntegrity(headerString) {
  return {
    algorithm: 'SHA256',
    hash: createHash('SHA256').update(headerString).digest('hex'),
  };
}

async function embedAsarIntegrity(runtime, asarPath, platform, version) {
  const integrity = asarHeaderIntegrity(getRawHeader(asarPath).headerString);
  if (platform === 'windows') {
    await resedit(runtime.executablePath, {
      productName: 'WorldForge',
      productVersion: version,
      fileVersion: version,
      asarIntegrity: { 'resources\\app.asar': integrity },
      win32Metadata: {
        CompanyName: 'WorldForge',
        FileDescription: 'WorldForge local-first writing workstation',
        InternalName: 'WorldForge',
        OriginalFilename: 'WorldForge.exe',
      },
    });
  } else if (platform === 'macos') {
    if (!runtime.plistPath) throw new Error('macOS package is missing Info.plist');
    const plist = await readFile(runtime.plistPath, 'utf8');
    const closingDictionary = plist.lastIndexOf('</dict>');
    if (closingDictionary < 0) throw new Error('macOS Info.plist has no root dictionary');
    const integrityDictionary = [
      '  <key>ElectronAsarIntegrity</key>',
      '  <dict>',
      '    <key>Resources/app.asar</key>',
      '    <dict>',
      '      <key>algorithm</key>',
      '      <string>SHA256</string>',
      '      <key>hash</key>',
      `      <string>${integrity.hash}</string>`,
      '    </dict>',
      '  </dict>',
      '',
    ].join('\n');
    await writeFile(
      runtime.plistPath,
      `${plist.slice(0, closingDictionary)}${integrityDictionary}${plist.slice(closingDictionary)}`,
      'utf8',
    );
  }
  return integrity;
}

async function hardenPackagedRuntime(runtime, platform, version) {
  const appRoot = path.join(runtime.resourcesPath, 'app');
  const asarPath = path.join(runtime.resourcesPath, 'app.asar');
  await rm(path.join(runtime.resourcesPath, 'default_app.asar'), { force: true });
  await createPackage(appRoot, asarPath);
  await rm(appRoot, { recursive: true, force: true });
  const asarIntegrity = await embedAsarIntegrity(runtime, asarPath, platform, version);
  await flipFuses(runtime.executablePath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: platform === 'macos' && process.arch === 'arm64',
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    [FuseV1Options.WasmTrapHandlers]: true,
  });
  return {
    asarPath,
    asarIntegrity,
  };
}

export function linuxPortableLauncher(binaryName = 'worldforge-bin') {
  if (path.posix.basename(binaryName) !== binaryName) {
    throw new Error('Linux portable runtime binary name must not contain a path');
  }
  return [
    '#!/bin/sh',
    'set -eu',
    'launcher_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    `exec "$launcher_dir/${binaryName}" --disable-setuid-sandbox "$@"`,
    '',
  ].join('\n');
}

async function configurePortableLauncher(runtime, platform) {
  if (platform !== 'linux') return null;
  const runtimeBinaryPath = path.join(runtime.bundlePath, 'worldforge-bin');
  await rename(runtime.executablePath, runtimeBinaryPath);
  await writeFile(runtime.executablePath, linuxPortableLauncher(), {
    encoding: 'utf8',
    mode: 0o755,
  });
  await chmod(runtimeBinaryPath, 0o755);
  return {
    launcher: path.basename(runtime.executablePath),
    runtimeBinary: path.basename(runtimeBinaryPath),
    sandbox: 'user-namespace',
  };
}

function completeEnvironmentGroup(environment, names, label) {
  const values = names.map((name) => environment[name]?.trim() ?? '');
  if (values.every((value) => value.length === 0)) return null;
  if (values.some((value) => value.length === 0)) {
    throw new Error(`${label} configuration is incomplete`);
  }
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

async function establishWindowsDistributionTrust(runtime, environment) {
  const credentials = completeEnvironmentGroup(
    environment,
    ['WINDOWS_CERTIFICATE_FILE', 'WINDOWS_CERTIFICATE_PASSWORD'],
    'Windows signing',
  );
  if (!credentials) {
    return { signed: false, notarized: false, stapled: false, evidence: null };
  }

  const { sign } = await import('@electron/windows-sign');
  await sign({
    appDirectory: runtime.bundlePath,
    certificateFile: credentials.WINDOWS_CERTIFICATE_FILE,
    certificatePassword: credentials.WINDOWS_CERTIFICATE_PASSWORD,
    hashes: ['sha256'],
    description: 'WorldForge local-first writing workstation',
  });
  run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `$signature = Get-AuthenticodeSignature -LiteralPath '${runtime.executablePath.replaceAll("'", "''")}'; if ($signature.Status -ne 'Valid' -or $null -eq $signature.TimeStamperCertificate) { exit 1 }`,
  ]);
  return {
    signed: true,
    notarized: false,
    stapled: false,
    evidence: {
      signing: 'authenticode-sha256',
      signatureVerification: 'Get-AuthenticodeSignature:Valid',
      timestamped: true,
    },
  };
}

async function establishMacosDistributionTrust(runtime, environment) {
  const signing = completeEnvironmentGroup(
    environment,
    ['WORLDFORGE_MACOS_SIGN_IDENTITY', 'WORLDFORGE_MACOS_KEYCHAIN'],
    'macOS signing',
  );
  const notarization = completeEnvironmentGroup(
    environment,
    ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'],
    'macOS notarization',
  );
  if (!signing && !notarization) {
    return { signed: false, notarized: false, stapled: false, evidence: null };
  }
  if (!signing || !notarization) {
    throw new Error('macOS signing and notarization must be configured together');
  }

  const [{ sign }, { notarize }] = await Promise.all([
    import('@electron/osx-sign'),
    import('@electron/notarize'),
  ]);
  await sign({
    app: runtime.bundlePath,
    platform: 'darwin',
    identity: signing.WORLDFORGE_MACOS_SIGN_IDENTITY,
    keychain: signing.WORLDFORGE_MACOS_KEYCHAIN,
    preAutoEntitlements: false,
  });
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', runtime.bundlePath]);
  await notarize({
    appPath: runtime.bundlePath,
    appleApiKey: notarization.APPLE_API_KEY,
    appleApiKeyId: notarization.APPLE_API_KEY_ID,
    appleApiIssuer: notarization.APPLE_API_ISSUER,
  });
  run('xcrun', ['stapler', 'staple', runtime.bundlePath]);
  run('xcrun', ['stapler', 'validate', runtime.bundlePath]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', runtime.bundlePath]);
  return {
    signed: true,
    notarized: true,
    stapled: true,
    evidence: {
      signing: 'developer-id-application',
      hardenedRuntime: true,
      signatureVerification: 'codesign:strict',
      notarizationVerification: 'stapler:validated',
      gatekeeperAssessment: 'spctl:accepted',
    },
  };
}

export async function establishDistributionTrust(runtime, platform, environment = process.env) {
  if (platform === 'windows') return establishWindowsDistributionTrust(runtime, environment);
  if (platform === 'macos') return establishMacosDistributionTrust(runtime, environment);
  return { signed: false, notarized: false, stapled: false, evidence: null };
}

export function assertRequiredDistributionTrust(platform, trust) {
  if (platform === 'windows' && trust.signed !== true) {
    throw new Error('Windows distribution trust is required but Authenticode signing is absent');
  }
  if (
    platform === 'macos' &&
    (trust.signed !== true || trust.notarized !== true || trust.stapled !== true)
  ) {
    throw new Error(
      'macOS distribution trust is required but signing, notarization, or stapling is absent',
    );
  }
}

function archiveExtension(platform) {
  return platform === 'linux' ? 'tar.gz' : 'zip';
}

export function archiveInvocation({ platform, stagingDirectory, bundleName, artifactPath }) {
  if (platform === 'macos') {
    return {
      command: 'ditto',
      arguments: [
        '-c',
        '-k',
        '--sequesterRsrc',
        '--keepParent',
        path.join(stagingDirectory, bundleName),
        artifactPath,
      ],
    };
  }
  if (platform === 'windows') {
    return {
      command: 'tar.exe',
      arguments: [
        '-a',
        '-c',
        '-f',
        path.win32.basename(artifactPath),
        '-C',
        stagingDirectory,
        bundleName,
      ],
      cwd: path.win32.dirname(artifactPath),
    };
  }
  return {
    command: 'tar',
    arguments: ['-czf', artifactPath, '-C', stagingDirectory, bundleName],
  };
}

function createArchive(options) {
  const invocation = archiveInvocation(options);
  run(invocation.command, invocation.arguments, { cwd: invocation.cwd });
}

async function sha256(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

export async function packageDesktop(argumentsList = process.argv.slice(2)) {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const options = parsePackageArguments(argumentsList, {
    packageVersion: packageJson.version,
  });
  for (const [filePath, label] of [
    [path.join(root, 'apps', 'desktop', 'main', 'dist', 'electron-main.js'), 'Electron main build'],
    [path.join(root, 'apps', 'desktop', 'preload', 'dist', 'index.cjs'), 'Preload build'],
    [path.join(root, 'apps', 'desktop', 'renderer', 'dist', 'index.html'), 'Renderer build'],
    [path.join(root, 'packages', 'core-service', 'dist', 'utility-entry.js'), 'Core service build'],
  ]) {
    await requirePath(filePath, label);
  }

  await rm(options.output, { recursive: true, force: true });
  await mkdir(options.output, { recursive: true });
  const stagingDirectory = await mkdtemp(path.join(tmpdir(), 'worldforge-package-'));
  try {
    const runtime = await copyElectronRuntime(stagingDirectory, options.platform, options.version);
    await prepareApplication(runtime.resourcesPath, options.version);
    const hardening = await hardenPackagedRuntime(runtime, options.platform, options.version);
    const portableLauncher = await configurePortableLauncher(runtime, options.platform);
    const distributionTrust = await establishDistributionTrust(runtime, options.platform);
    if (options.distributionTrust === 'required') {
      assertRequiredDistributionTrust(options.platform, distributionTrust);
    }
    const artifactName = `WorldForge-v${options.version}-${options.platform}-${runtime.architecture}.${archiveExtension(options.platform)}`;
    const artifactPath = path.join(options.output, artifactName);
    createArchive({
      platform: options.platform,
      stagingDirectory,
      bundleName: runtime.bundleName,
      artifactPath,
    });
    const metadata = {
      schemaVersion: 2,
      product: 'WorldForge',
      version: options.version,
      platform: options.platform,
      releaseKind: options.releaseKind,
      distributionTrustMode: options.distributionTrust,
      architecture: runtime.architecture,
      artifact: artifactName,
      bytes: (await stat(artifactPath)).size,
      sha256: await sha256(artifactPath),
      packageKind: 'portable-electron-bundle',
      signed: distributionTrust.signed,
      notarized: distributionTrust.notarized,
      stapled: distributionTrust.stapled,
      distributionTrustEvidence: distributionTrust.evidence,
      fusesApplied: true,
      asar: true,
      appAsarSha256: await sha256(hardening.asarPath),
      appAsarHeaderSha256: hardening.asarIntegrity.hash,
      fuses: {
        runAsNode: false,
        onlyLoadAppFromAsar: true,
        embeddedAsarIntegrityValidation: true,
        grantFileProtocolExtraPrivileges: false,
        loadBrowserProcessSpecificV8Snapshot: false,
        wasmTrapHandlers: true,
      },
      ...(portableLauncher ? { portableLauncher } : {}),
      limitations:
        distributionTrust.evidence === null
          ? ['This package has no platform distribution signature or notarization evidence.']
          : [],
    };
    await writeFile(
      path.join(options.output, 'package-manifest.json'),
      `${JSON.stringify(metadata, null, 2)}\n`,
      'utf8',
    );
    console.log(`Packaged ${artifactName} (${metadata.bytes} bytes).`);
    return metadata;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  packageDesktop().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
