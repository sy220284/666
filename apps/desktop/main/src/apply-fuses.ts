import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';

import { productionFusePolicy } from './fuse-policy.js';

const executablePath = process.argv[2];

if (!executablePath) {
  throw new Error('Usage: pnpm --filter @worldforge/main fuses:apply <packaged-electron-binary>');
}

await flipFuses(executablePath, {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: productionFusePolicy.runAsNode,
  [FuseV1Options.EnableCookieEncryption]: productionFusePolicy.enableCookieEncryption,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]:
    productionFusePolicy.enableNodeOptionsEnvironmentVariable,
  [FuseV1Options.EnableNodeCliInspectArguments]: productionFusePolicy.enableNodeCliInspectArguments,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:
    productionFusePolicy.enableEmbeddedAsarIntegrityValidation,
  [FuseV1Options.OnlyLoadAppFromAsar]: productionFusePolicy.onlyLoadAppFromAsar,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]:
    productionFusePolicy.loadBrowserProcessSpecificV8Snapshot,
});
