import { createHash } from "node:crypto";
import {
  cp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
} from "node:fs/promises";
import path from "node:path";

import { type ProjectWorkspaceSummary } from "@worldforge/contracts";

import {
  existingDirectory,
  isInside,
  ProjectWorkspaceError,
  workspaceExists,
} from "./workspace-path-policy.js";
import {
  closeProjectContext,
  loadWorkspace,
  type ProjectWorkspaceOperationContext,
} from "./workspace-verifier.js";

async function workspaceSize(directory: string): Promise<bigint> {
  let total = 0n;
  const visit = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new ProjectWorkspaceError(
          "PROJECT_PATH_OUTSIDE_SCOPE",
          "Symbolic links are not allowed inside a project workspace.",
        );
      }
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile()) total += BigInt((await stat(entryPath)).size);
    }
  };
  await visit(directory);
  return total;
}

export async function defaultCopyWorkspace(
  source: string,
  target: string,
): Promise<void> {
  await cp(source, target, {
    recursive: true,
    force: false,
    errorOnExist: true,
    preserveTimestamps: true,
    verbatimSymlinks: true,
  });
}

export async function defaultHashWorkspace(directory: string): Promise<string> {
  const hash = createHash("sha256");
  const visit = async (
    current: string,
    relativeDirectory: string,
  ): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new ProjectWorkspaceError(
          "PROJECT_PATH_OUTSIDE_SCOPE",
          "Symbolic links are not allowed inside a project workspace.",
        );
      }
      if (entry.isDirectory()) {
        hash.update(`directory\0${relativePath}\0`, "utf8");
        await visit(entryPath, relativePath);
      } else if (entry.isFile()) {
        hash.update(`file\0${relativePath}\0`, "utf8");
        hash.update(await readFile(entryPath));
        hash.update("\0", "utf8");
      } else {
        throw new ProjectWorkspaceError(
          "PROJECT_PATH_OUTSIDE_SCOPE",
          "Unsupported filesystem entries are not allowed inside a project workspace.",
        );
      }
    }
  };
  await visit(directory, "");
  return hash.digest("hex");
}

export async function defaultFreeBytes(directory: string): Promise<bigint> {
  const details = await statfs(directory, { bigint: true });
  return details.bavail * details.bsize;
}

export async function moveProjectWorkspace(
  runtime: ProjectWorkspaceOperationContext,
  requestId: string,
  projectId: string,
  targetParentDirectory: string,
): Promise<ProjectWorkspaceSummary & { readonly sourceRetained: boolean }> {
  const context = runtime.assertActiveContext(projectId, true);
  const source = context.summary.workspacePath;
  const targetParent = await existingDirectory(targetParentDirectory, true);
  if (isInside(source, targetParent)) {
    throw new ProjectWorkspaceError(
      "PROJECT_MOVE_FAILED",
      "A project cannot be moved inside its own workspace.",
    );
  }
  const target = path.join(targetParent, path.basename(source));
  if (target === source) {
    return { ...context.summary, sourceRetained: false };
  }
  if (await workspaceExists(target)) {
    throw new ProjectWorkspaceError(
      "PROJECT_TARGET_CONFLICT",
      "The move target already exists.",
    );
  }

  const staging = `${target}.move-${runtime.idFactory()}`;
  let targetCreated = false;
  try {
    try {
      await closeProjectContext(context);
    } finally {
      if (runtime.active === context) runtime.active = null;
    }

    const requiredBytes = await workspaceSize(source);
    const safetyMargin = requiredBytes / 10n + 64n * 1024n * 1024n;
    if (
      (await runtime.freeBytes(targetParent)) <
      requiredBytes + safetyMargin
    ) {
      throw new ProjectWorkspaceError(
        "PROJECT_MOVE_FAILED",
        "The target volume does not have enough free space.",
      );
    }
    await runtime.copyWorkspace(source, staging);
    const [sourceHash, targetHash] = await Promise.all([
      runtime.hashWorkspace(source),
      runtime.hashWorkspace(staging),
    ]);
    if (sourceHash !== targetHash) {
      throw new ProjectWorkspaceError(
        "PROJECT_MOVE_FAILED",
        "The copied project did not match the source workspace.",
      );
    }
    const verification = await loadWorkspace(runtime, staging);
    await closeProjectContext(verification);
    await rename(staging, target);
    targetCreated = true;

    const moved = await loadWorkspace(runtime, target);
    await runtime.registerRecentBestEffort(requestId, moved.summary);
    runtime.active = moved;
    let sourceRetained = false;
    try {
      await rm(source, { recursive: true });
    } catch {
      sourceRetained = true;
    }
    return { ...moved.summary, sourceRetained };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (targetCreated && !runtime.active) {
      await rm(target, { recursive: true, force: true });
    }
    if (!runtime.active && (await workspaceExists(source))) {
      try {
        const restored = await loadWorkspace(runtime, source);
        runtime.active = restored;
        await runtime.registerRecentBestEffort(
          runtime.idFactory(),
          restored.summary,
        );
      } catch {
        // Keep the original move error. The source remains untouched for manual recovery.
      }
    }
    if (error instanceof ProjectWorkspaceError) throw error;
    throw new ProjectWorkspaceError(
      "PROJECT_MOVE_FAILED",
      "The project move failed; the original workspace was retained.",
      { cause: error },
    );
  }
}
