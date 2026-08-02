import { access, constants, lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export type ProjectWorkspaceErrorCode =
  | 'PROJECT_ALREADY_ACTIVE'
  | 'PROJECT_ID_MISMATCH'
  | 'PROJECT_PATH_OUTSIDE_SCOPE'
  | 'PROJECT_PATH_MISSING'
  | 'PROJECT_MOVE_FAILED'
  | 'PROJECT_TARGET_CONFLICT'
  | 'PROJECT_READ_ONLY'
  | 'PROJECT_DIRECTORY_READ_ONLY'
  | 'PROJECT_OPEN_FAILED'
  | 'PROJECT_CREATE_FAILED'
  | 'PROJECT_MANIFEST_INVALID';

export class ProjectWorkspaceError extends Error {
  readonly code: ProjectWorkspaceErrorCode;

  constructor(code: ProjectWorkspaceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProjectWorkspaceError';
    this.code = code;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function isPermissionFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    ['EACCES', 'EPERM', 'EROFS'].includes(String(error.code))
  );
}

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

export function validWorkspaceName(name: string): string {
  const trimmed = name.trim();
  const containsControlCharacter = [...trimmed].some(
    (character) => (character.codePointAt(0) ?? 0) < 32,
  );
  if (
    trimmed === '.' ||
    trimmed === '..' ||
    /[<>:"/\\|?*]/u.test(trimmed) ||
    containsControlCharacter ||
    /[. ]$/u.test(trimmed)
  ) {
    throw new ProjectWorkspaceError(
      'PROJECT_PATH_OUTSIDE_SCOPE',
      'The project name cannot be represented as a safe workspace directory.',
    );
  }
  return `${trimmed}.worldforge`;
}

export async function existingDirectory(
  directory: string,
  requireWritable = false,
): Promise<string> {
  if (!path.isAbsolute(directory)) {
    throw new ProjectWorkspaceError(
      'PROJECT_PATH_OUTSIDE_SCOPE',
      'Project directories must be absolute paths selected by the desktop process.',
    );
  }
  try {
    const canonical = await realpath(path.normalize(directory));
    const details = await stat(canonical);
    if (!details.isDirectory()) {
      throw new ProjectWorkspaceError(
        'PROJECT_PATH_MISSING',
        'The selected path is not a directory.',
      );
    }
    if (requireWritable) {
      if ((details.mode & 0o222) === 0) {
        throw new ProjectWorkspaceError(
          'PROJECT_DIRECTORY_READ_ONLY',
          'The selected directory is read-only.',
        );
      }
      await access(canonical, constants.W_OK);
    }
    return canonical;
  } catch (error) {
    if (error instanceof ProjectWorkspaceError) throw error;
    if (isPermissionFailure(error)) {
      throw new ProjectWorkspaceError(
        'PROJECT_DIRECTORY_READ_ONLY',
        'The selected directory cannot be written.',
        { cause: error },
      );
    }
    throw new ProjectWorkspaceError(
      'PROJECT_PATH_MISSING',
      'The selected project directory does not exist.',
      { cause: error },
    );
  }
}

export async function workspaceExists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function resolveWorkspacePath(root: string, relativePath: string): Promise<string> {
  if (
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/u).includes('..')
  ) {
    throw new ProjectWorkspaceError(
      'PROJECT_PATH_OUTSIDE_SCOPE',
      'The requested path is outside the active project workspace.',
    );
  }
  const candidate = path.resolve(root, relativePath);
  if (!isInside(root, candidate)) {
    throw new ProjectWorkspaceError(
      'PROJECT_PATH_OUTSIDE_SCOPE',
      'The requested path is outside the active project workspace.',
    );
  }

  let current = root;
  for (const segment of path.relative(root, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) {
        throw new ProjectWorkspaceError(
          'PROJECT_PATH_OUTSIDE_SCOPE',
          'Symbolic links cannot escape the active project workspace.',
        );
      }
      const canonical = await realpath(current);
      if (!isInside(root, canonical)) {
        throw new ProjectWorkspaceError(
          'PROJECT_PATH_OUTSIDE_SCOPE',
          'The requested path resolved outside the active project workspace.',
        );
      }
    } catch (error) {
      if (error instanceof ProjectWorkspaceError) throw error;
      if (isMissing(error)) break;
      throw error;
    }
  }
  return candidate;
}
