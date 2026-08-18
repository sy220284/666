import type { CommandCatalogEntry } from './command-catalog.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import type { PrimaryNavigationId } from '../../shell/app-shell-model.js';
import type { RendererRouteId } from '../../state/ui-state-boundary.js';

export interface CommandExecutionContext {
  readonly projectId: string | null;
  readonly onNavigate: (id: PrimaryNavigationId) => void;
  readonly onTransitionToRoute: (route: RendererRouteId) => Promise<boolean>;
  readonly onNavigateTarget: (target: AuthorNavigationTarget) => void;
  readonly onCommandPaletteToggle?: () => void;
  readonly onTypewriterModeToggle?: () => void;
}

export function executeCatalogCommand(
  entry: CommandCatalogEntry,
  context: CommandExecutionContext,
): boolean {
  if (entry.kind === 'system') {
    if (entry.id === 'system.commandPalette') {
      context.onCommandPaletteToggle?.();
      return true;
    }
    if (entry.id === 'system.typewriterMode') {
      context.onTypewriterModeToggle?.();
      return true;
    }
    return false;
  }
  if (entry.kind === 'navigation') {
    context.onNavigate(entry.navigationId);
    return true;
  }
  if (entry.kind === 'route') {
    void context.onTransitionToRoute(entry.route);
    return true;
  }
  if (!context.projectId) return false;
  context.onNavigateTarget({
    type: 'writing-action',
    projectId: context.projectId,
    generationMode: entry.generationMode,
  });
  return true;
}
