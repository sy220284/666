import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ProjectWorkspaceManifestSchema,
  type ProjectWorkspaceManifest,
} from '@worldforge/contracts';

import { ProjectWorkspaceError } from './workspace-path-policy.js';

export async function readWorkspaceManifest(
  manifestPath: string,
): Promise<ProjectWorkspaceManifest> {
  try {
    return ProjectWorkspaceManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
    );
  } catch (error) {
    throw new ProjectWorkspaceError(
      'PROJECT_MANIFEST_INVALID',
      'The project manifest is invalid or unsupported.',
      { cause: error },
    );
  }
}

export async function replaceWorkspaceManifest(
  manifestPath: string,
  manifest: ProjectWorkspaceManifest,
  idFactory: () => string,
): Promise<void> {
  const temporaryManifestPath = `${manifestPath}.update-${idFactory()}`;
  try {
    await writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporaryManifestPath, manifestPath);
  } finally {
    await rm(temporaryManifestPath, { force: true });
  }
}

export async function writeWorkspaceManifest(
  workspacePath: string,
  manifest: ProjectWorkspaceManifest,
): Promise<void> {
  await writeFile(
    path.join(workspacePath, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600, flag: 'wx' },
  );
}
