import type { CoreStatus, ProjectWorkspaceSummary } from '@worldforge/contracts';

export type ProjectOperatingMode =
  'closed' | 'normal' | 'read-only-compatible' | 'read-only-integrity-failed' | 'recovery-only';

export interface ApplicationCapabilities {
  readonly shellAvailable: boolean;
  readonly coreAvailable: boolean;
  readonly settingsAvailable: boolean;
  readonly providerAvailable: boolean;
  readonly generationAvailable: boolean;
  readonly diagnosticsAvailable: boolean;
}

export interface ProjectCapabilities {
  readonly mode: ProjectOperatingMode;
  readonly projectReadable: boolean;
  readonly projectWritable: boolean;
  readonly databaseReadable: boolean;
  readonly structureReadable: boolean;
  readonly draftReadable: boolean;
  readonly draftWritable: boolean;
  readonly canonReadable: boolean;
  readonly canonWritable: boolean;
  readonly exportAvailable: boolean;
  readonly backupAvailable: boolean;
  readonly restoreAvailable: boolean;
  readonly moveAvailable: boolean;
}

export interface CapabilityNavigationAvailability {
  readonly home: boolean;
  readonly planning: boolean;
  readonly writing: boolean;
  readonly canon: boolean;
  readonly checks: boolean;
  readonly settings: boolean;
}

export interface CapabilityMatrix {
  readonly application: ApplicationCapabilities;
  readonly project: ProjectCapabilities;
  readonly navigation: CapabilityNavigationAvailability;
}

const RECOVERY_ONLY_REASONS = new Set([
  'migration-failed',
  'checksum-mismatch',
  'integrity-failed',
]);

function applicationCapabilities(
  hydrated: boolean,
  coreStatus: CoreStatus | null,
  providerCount: number,
): ApplicationCapabilities {
  const coreAvailable = coreStatus?.status === 'healthy';
  return {
    shellAvailable: hydrated,
    coreAvailable,
    settingsAvailable: hydrated,
    providerAvailable: coreAvailable && providerCount > 0,
    generationAvailable: coreAvailable && providerCount > 0,
    diagnosticsAvailable: hydrated,
  };
}

function closedProject(): ProjectCapabilities {
  return {
    mode: 'closed',
    projectReadable: false,
    projectWritable: false,
    databaseReadable: false,
    structureReadable: false,
    draftReadable: false,
    draftWritable: false,
    canonReadable: false,
    canonWritable: false,
    exportAvailable: false,
    backupAvailable: false,
    restoreAvailable: false,
    moveAvailable: false,
  };
}

function projectCapabilities(
  project: ProjectWorkspaceSummary | null,
  coreAvailable: boolean,
): ProjectCapabilities {
  if (!project || !coreAvailable) return closedProject();
  if (project.databaseMode === 'read-write') {
    return {
      mode: 'normal',
      projectReadable: true,
      projectWritable: true,
      databaseReadable: true,
      structureReadable: true,
      draftReadable: true,
      draftWritable: true,
      canonReadable: true,
      canonWritable: true,
      exportAvailable: true,
      backupAvailable: true,
      restoreAvailable: true,
      moveAvailable: true,
    };
  }

  if (RECOVERY_ONLY_REASONS.has(project.compatibility)) {
    const integrityFailed = project.compatibility === 'integrity-failed';
    return {
      mode: integrityFailed ? 'read-only-integrity-failed' : 'recovery-only',
      projectReadable: false,
      projectWritable: false,
      databaseReadable: false,
      structureReadable: false,
      draftReadable: false,
      draftWritable: false,
      canonReadable: false,
      canonWritable: false,
      exportAvailable: true,
      backupAvailable: false,
      restoreAvailable: true,
      moveAvailable: false,
    };
  }

  return {
    mode: 'read-only-compatible',
    projectReadable: true,
    projectWritable: false,
    databaseReadable: true,
    structureReadable: true,
    draftReadable: true,
    draftWritable: false,
    canonReadable: true,
    canonWritable: false,
    exportAvailable: true,
    backupAvailable: false,
    restoreAvailable: true,
    moveAvailable: false,
  };
}

export function deriveCapabilityMatrix(input: {
  readonly hydrated: boolean;
  readonly coreStatus: CoreStatus | null;
  readonly project: ProjectWorkspaceSummary | null;
  readonly providerCount: number;
  readonly verifiedProviderCount: number;
}): CapabilityMatrix {
  const application = applicationCapabilities(
    input.hydrated,
    input.coreStatus,
    input.providerCount,
  );
  const project = projectCapabilities(input.project, application.coreAvailable);
  return {
    application,
    project,
    navigation: {
      home: application.shellAvailable,
      planning: project.structureReadable,
      writing: project.draftReadable,
      canon: project.canonReadable,
      checks: project.projectReadable,
      settings: application.settingsAvailable,
    },
  };
}
