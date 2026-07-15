export const productionFusePolicy = {
  runAsNode: false,
  enableCookieEncryption: true,
  enableNodeOptionsEnvironmentVariable: false,
  enableNodeCliInspectArguments: false,
  enableEmbeddedAsarIntegrityValidation: true,
  onlyLoadAppFromAsar: true,
  loadBrowserProcessSpecificV8Snapshot: true,
} as const;

export const productionDevToolsPolicy = {
  browserWindowDevTools: false,
  remoteDebugging: false,
  reason: 'Production builds expose no DevTools or remote-debugging entry point.',
} as const;
