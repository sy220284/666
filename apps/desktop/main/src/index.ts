export { CoreSupervisor, type UtilityProcessHandle } from './core-supervisor.js';
export { CredentialBroker, type SafeStorageAdapter } from './credential-broker.js';
export { productionDevToolsPolicy, productionFusePolicy } from './fuse-policy.js';
export { installNavigationPolicy, isExternalWebUrl } from './navigation-policy.js';
export { PrivacyLogger, sanitizeLogFields } from './privacy-logger.js';
export { buildSecureWebPreferences, CONTENT_SECURITY_POLICY } from './security-policy.js';

export const mainLayer = {
  name: '@worldforge/main',
  responsibility: 'desktop-lifecycle-and-os-integration',
} as const;
