import {
  ProjectIdSchema,
  type ProjectWorkspaceSummary,
} from "@worldforge/contracts";

import {
  closeProjectContext,
  loadWorkspace,
  type ProjectWorkspaceOperationContext,
} from "./workspace-verifier.js";

export type ProjectOpenInput =
  { readonly workspacePath: string } | { readonly recentProjectId: string };

export async function openProjectWorkspace(
  runtime: ProjectWorkspaceOperationContext,
  requestId: string,
  input: ProjectOpenInput,
): Promise<ProjectWorkspaceSummary> {
  runtime.assertNoActive();
  let workspacePath: string;
  if ("recentProjectId" in input) {
    const projectId = ProjectIdSchema.parse(input.recentProjectId);
    workspacePath = runtime.recentProjects.get(projectId).workspacePath;
  } else {
    workspacePath = input.workspacePath;
  }
  const context = await loadWorkspace(runtime, workspacePath);
  await runtime.registerRecentBestEffort(requestId, context.summary);
  runtime.active = context;
  return context.summary;
}

export async function registerRecoveredProjectWorkspace(
  runtime: ProjectWorkspaceOperationContext,
  requestId: string,
  workspacePath: string,
): Promise<ProjectWorkspaceSummary> {
  const context = await loadWorkspace(runtime, workspacePath);
  try {
    await runtime.registerRecentBestEffort(requestId, context.summary);
    return context.summary;
  } finally {
    await closeProjectContext(context);
  }
}
