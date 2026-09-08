import { createHash } from 'node:crypto';
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

const WORKSPACE_EXTENSION = '.worldforge';
const MAX_WORKSPACE_COMPONENT_BYTES = 200;

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function truncateUtf8(value: string, maximumBytes: number): string {
  let result = '';
  for (const character of value) {
    if (utf8Bytes(result) + utf8Bytes(character) > maximumBytes) break;
    result += character;
  }
  return result.replace(/[. ]+$/u, '');
}

function isWindowsDeviceName(value: string): boolean {
  const stem = value.split('.', 1)[0]?.toLowerCase() ?? '';
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(stem);
}

function boundedWorkspaceBase(value: string): string {
  const portable = isWindowsDeviceName(value) ? `WorldForge-${value}` : value;
  const maximumBaseBytes = MAX_WORKSPACE_COMPONENT_BYTES - utf8Bytes(WORKSPACE_EXTENSION);
  if (utf8Bytes(portable) <= maximumBaseBytes) return portable;

  const suffix = `-${createHash('sha256').update(portable, 'utf8').digest('hex').slice(0, 10)}`;
  const prefix = truncateUtf8(portable, maximumBaseBytes - utf8Bytes(suffix));
  return `${prefix || 'WorldForge'}${suffix}`;
}

export function validWorkspaceName(name: string): string {
  const trimmed = name.trim();
  const containsControlCharacter = [...trimmed].some(
    (character) => (character.codePointAt(0) ?? 0) < 32,
  );
  if (
    !trimmed ||
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
  return `${boundedWorkspaceBase(trimmed)}${WORKSPACE_EXTENSION}`;
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
