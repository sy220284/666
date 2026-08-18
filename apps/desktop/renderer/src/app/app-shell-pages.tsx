import type {
  AppSettings,
  AppSettingsUpdate,
  AppearancePreferences,
  CoreStatus,
  ProjectContinuationSnapshot,
  ProjectWorkspaceSummary,
  ProviderConnectionTestResult,
  ProviderSummary,
  RecentProject,
  TaskSnapshot,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import { CanonWorkbench, type CanonSection } from '../features/canon/canon-workbench.js';
import { ChecksWorkbench } from '../features/checks/checks-workbench.js';
import {
  DataToolsWorkbench,
  type DataToolsSection,
} from '../features/data-tools/data-tools-workbench.js';
import { RecoveryOverviewGate } from '../features/data-tools/recovery-overview-gate.js';
import { HomePage, type OnboardingProjectPlan } from '../features/home/home-page.js';
import { JournalWorkbench } from '../features/journal/journal-workbench.js';
import { PlanningWorkbench } from '../features/planning/planning-workbench.js';
import { ResearchWorkbench } from '../features/research/research-workbench.js';
import { SettingsPage } from '../features/settings/settings-page.js';
import { WritingWorkbench, type WritingPanel } from '../features/writing/writing-workbench.js';
import type { AiReadiness } from '../runtime/ai-readiness.js';
import type { CapabilityMatrix } from '../runtime/capability-matrix.js';
import type { AppDisclosureMode, PrimaryNavigationId } from '../shell/app-shell-model.js';
import type { AuthorNavigationTarget } from '../shell/navigation-target.js';
import type { HomeHealthSignal } from '../shell/home-dashboard-model.js';
import type { RendererRouteId, RendererSelectionState } from '../state/ui-state-boundary.js';
import { continuationRoute, isWritingRoute } from './app-shell-helpers.js';

export interface AppShellPagesProps {
  readonly bridge: RendererBridgeAdapter;
  readonly route: RendererRouteId;
  readonly activeProject: ProjectWorkspaceSummary | null;
  readonly continuation: ProjectContinuationSnapshot | null;
  readonly recentProjects: readonly RecentProject[];
  readonly tasks: readonly TaskSnapshot[];
  readonly healthSignals: readonly HomeHealthSignal[];
  readonly capabilities: CapabilityMatrix;
  readonly disclosureMode: AppDisclosureMode;
  readonly aiReadiness: AiReadiness;
  readonly providers: readonly ProviderSummary[];
  readonly settings: AppSettings;
  readonly appearance: AppearancePreferences;
  readonly coreStatus: CoreStatus | null;
  readonly message: string | null;
  readonly onboardingRequest: number;
  readonly pendingKey: string | null;
  readonly canonSection: CanonSection;
  readonly dataToolsSection: DataToolsSection;
  readonly writingPanel: WritingPanel;
  readonly selection: RendererSelectionState;
  readonly navigationQuery: string | null;
  readonly navigationGenerationMode: string | null;
  readonly onCreateFromOnboarding: (plan: OnboardingProjectPlan) => Promise<boolean>;
  readonly onCloseProject: (projectId: string) => Promise<void>;
  readonly onMoveProject: (projectId: string) => Promise<void>;
  readonly onOpenRecent: (projectId: string) => Promise<void>;
  readonly onOpenSelected: (recover: boolean) => Promise<void>;
  readonly onRelocateRecent: (projectId: string) => Promise<void>;
  readonly onRemoveRecent: (projectId: string) => Promise<void>;
  readonly onNavigate: (navigationId: PrimaryNavigationId) => void;
  readonly onNavigateToAuthorTarget: (target: AuthorNavigationTarget) => void;
  readonly onTransitionToRoute: (route: RendererRouteId) => Promise<boolean>;
  readonly onCloseSettings: () => void;
  readonly onReturnToAuthorSource: () => Promise<void>;
  readonly onSaveSettings: (update: AppSettingsUpdate) => Promise<boolean>;
  readonly onResetSettings: () => Promise<void>;
  readonly onSaveAppearance: (appearance: AppearancePreferences) => Promise<boolean>;
  readonly onRestartCore: () => Promise<void>;
  readonly onProvidersChanged: (providers: readonly ProviderSummary[]) => void;
  readonly onProviderConnectionVerified: (result: ProviderConnectionTestResult) => void;
  readonly onProviderInvalidated: (providerId: string) => void;
  readonly onOpenOnboarding: () => void;
  readonly onCanonSectionChange: (section: CanonSection) => void;
  readonly onDataToolsSectionChange: (section: DataToolsSection) => void;
  readonly onProjectRestored: () => Promise<void>;
  readonly onWritingStatus: (message: string) => void;
}

export function AppShellPages(props: AppShellPagesProps) {
  const readOnly = props.activeProject?.databaseMode === 'read-only';
  return (
    <>
      {props.route === 'home' || props.route === 'project' ? (
        <HomePage
          activeProject={props.activeProject}
          activeTaskCount={props.tasks.length}
          continuation={props.continuation}
          disclosureMode={props.disclosureMode}
          healthSignals={props.healthSignals}
          message={props.message}
          onboardingRequest={props.onboardingRequest}
          pendingKey={props.pendingKey}
          projectCapabilities={props.capabilities.project}
          providerAvailable={props.aiReadiness.status === 'ready'}
          recentProjects={props.recentProjects}
          settings={props.settings}
          onCloseProject={(projectId) => void props.onCloseProject(projectId)}
          onCreate={props.onCreateFromOnboarding}
          onContinue={() => {
            if (props.activeProject) {
              void props.onTransitionToRoute(continuationRoute(props.continuation));
              return;
            }
            const recent = [...props.recentProjects]
              .filter((project) => project.missingSince === null)
              .sort(
                (left, right) => Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt),
              )[0];
            if (recent) void props.onOpenRecent(recent.projectId);
          }}
          onMoveProject={(projectId) => void props.onMoveProject(projectId)}
          onNavigate={props.onNavigate}
          onOpenRecent={(projectId) => void props.onOpenRecent(projectId)}
          onOpenRecovery={() => void props.onTransitionToRoute('recovery')}
          onOpenSelected={(recover) => void props.onOpenSelected(recover)}
          onRelocateRecent={(projectId) => void props.onRelocateRecent(projectId)}
          onRemoveRecent={(projectId) => void props.onRemoveRecent(projectId)}
          onSaveSettings={props.onSaveSettings}
        />
      ) : null}

      {props.route === 'settings' ? (
        <SettingsPage
          appearance={props.appearance}
          bridge={props.bridge}
          coreStatus={props.coreStatus}
          disclosureMode={props.disclosureMode}
          message={props.message}
          pendingKey={props.pendingKey}
          project={props.activeProject}
          providers={props.providers}
          settings={props.settings}
          aiReady={props.aiReadiness.status === 'ready'}
          onProvidersChanged={props.onProvidersChanged}
          onProviderConnectionVerified={props.onProviderConnectionVerified}
          onProviderInvalidated={props.onProviderInvalidated}
          onClose={props.onCloseSettings}
          onResetSettings={() => void props.onResetSettings()}
          onRestartCore={() => void props.onRestartCore()}
          onSaveAppearance={props.onSaveAppearance}
          onSaveSettings={props.onSaveSettings}
          onOpenOnboarding={props.onOpenOnboarding}
        />
      ) : null}

      {props.route === 'planning' && props.activeProject ? (
        <PlanningWorkbench
          bridge={props.bridge}
          projectId={props.activeProject.projectId}
          readOnly={readOnly}
          disclosureMode={props.disclosureMode}
          onDisclosureModeChange={(mode) => void props.onSaveSettings({ defaultMode: mode })}
          onNavigate={props.onNavigateToAuthorTarget}
          onClose={() => void props.onTransitionToRoute('writing')}
          onReturn={() => void props.onReturnToAuthorSource()}
        />
      ) : null}

      {props.route === 'canon' && props.activeProject ? (
        <CanonWorkbench
          bridge={props.bridge}
          projectId={props.activeProject.projectId}
          projectName={props.activeProject.name}
          readOnly={readOnly}
          section={props.canonSection}
          selectedEntityId={props.selection.entityId}
          selectedChapterId={props.selection.chapterId}
          onNavigate={props.onNavigateToAuthorTarget}
          onSectionChange={props.onCanonSectionChange}
          onReturn={() => void props.onReturnToAuthorSource()}
        />
      ) : null}

      {props.route === 'research' && props.activeProject ? (
        <ResearchWorkbench
          bridge={props.bridge}
          projectId={props.activeProject.projectId}
          readOnly={readOnly}
          selectedNoteId={props.selection.researchNoteId}
          navigationQuery={props.navigationQuery}
          onNavigate={props.onNavigateToAuthorTarget}
          onSelectNote={(noteId) => {
            if (!noteId) return;
            props.onNavigateToAuthorTarget({
              type: 'research-note',
              projectId: props.activeProject!.projectId,
              noteId,
              query: null,
            });
          }}
          onClose={() => void props.onTransitionToRoute('writing')}
        />
      ) : null}

      {props.route === 'journal' && props.activeProject ? (
        <JournalWorkbench
          bridge={props.bridge}
          projectId={props.activeProject.projectId}
          readOnly={readOnly}
          onNavigate={props.onNavigateToAuthorTarget}
        />
      ) : null}

      {props.route === 'recovery' && props.activeProject ? (
        <RecoveryOverviewGate bridge={props.bridge} projectId={props.activeProject.projectId}>
          {(recoveryBridge) => (
            <DataToolsWorkbench
              bridge={recoveryBridge}
              projectId={props.activeProject!.projectId}
              readOnly={readOnly}
              section={props.dataToolsSection}
              onClose={() => void props.onTransitionToRoute('writing')}
              onProjectRestored={props.onProjectRestored}
              onSectionChange={props.onDataToolsSectionChange}
            />
          )}
        </RecoveryOverviewGate>
      ) : null}

      {isWritingRoute(props.route) && props.activeProject ? (
        <WritingWorkbench
          key={props.activeProject.projectId}
          bridge={props.bridge}
          disclosureMode={props.disclosureMode}
          initialContinuation={props.continuation}
          panel={props.writingPanel}
          project={props.activeProject}
          typewriterMode={props.settings.typewriterMode}
          typewriterAnchorPercent={props.settings.typewriterAnchorPercent}
          onTypewriterModeChange={(enabled) => props.onSaveSettings({ typewriterMode: enabled })}
          navigationChapterId={props.selection.chapterId}
          navigationLogicalBlockId={props.selection.logicalBlockId}
          navigationVersionId={props.selection.versionId}
          navigationQuery={props.navigationQuery}
          navigationGenerationMode={props.navigationGenerationMode}
          onNavigate={props.onNavigateToAuthorTarget}
          onPanelChange={(panel) =>
            void props.onTransitionToRoute(
              panel === 'versions' ? 'versions' : panel === 'candidates' ? 'candidates' : 'writing',
            )
          }
          onStatus={props.onWritingStatus}
          onReturn={() => void props.onReturnToAuthorSource()}
        />
      ) : null}

      {props.route === 'checks' && props.activeProject ? (
        <ChecksWorkbench
          bridge={props.bridge}
          projectId={props.activeProject.projectId}
          readOnly={readOnly}
          onNavigate={props.onNavigateToAuthorTarget}
        />
      ) : null}
    </>
  );
}
