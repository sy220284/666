import { stat } from 'node:fs/promises';
import path from 'node:path';

import {
  ProjectIdSchema,
  RecentProjectRegistrationSchema,
  RecentProjectSchema,
  type RecentProject,
  type RecentProjectRegistration,
} from '@worldforge/contracts';

import { AppDataRepositoryError } from './app-data-errors.js';
import type { AppDatabase, DatabaseClock } from './database/index.js';

const systemClock: DatabaseClock = { now: () => new Date() };

function normalizedAbsolutePath(value: string): string {
  if (!path.isAbsolute(value)) {
    throw new AppDataRepositoryError(
      'RECENT_PROJECT_PATH_MISSING',
      'A recent project path must be absolute.',
    );
  }
  return path.normalize(value);
}

async function isDirectory(value: string): Promise<boolean> {
  try {
    return (await stat(value)).isDirectory();
  } catch {
    return false;
  }
}

function rowToRecentProject(row: Record<string, unknown>): RecentProject {
  return RecentProjectSchema.parse({
    projectId: row.project_id,
    workspacePath: row.workspace_path,
    displayName: row.display_name,
    lastOpenedAt: row.last_opened_at,
    missingSince: row.missing_since,
  });
}

export class RecentProjectsRepository {
  readonly #database: AppDatabase;
  readonly #clock: DatabaseClock;

  constructor(database: AppDatabase, clock: DatabaseClock = systemClock) {
    this.#database = database;
    this.#clock = clock;
  }

  get(projectId: string): RecentProject {
    const validProjectId = ProjectIdSchema.parse(projectId);
    const project = this.#database.read((database) =>
      database
        .prepare(
          `SELECT project_id, workspace_path, display_name, last_opened_at, missing_since
             FROM recent_projects
            WHERE project_id = ?`,
        )
        .get(validProjectId),
    );
    if (!project) {
      throw new AppDataRepositoryError(
        'RECENT_PROJECT_NOT_FOUND',
        'The recent project record does not exist.',
      );
    }
    return rowToRecentProject(project);
  }

  async register(requestId: string, input: RecentProjectRegistration): Promise<RecentProject> {
    const registration = RecentProjectRegistrationSchema.parse(input);
    const workspacePath = normalizedAbsolutePath(registration.workspacePath);
    if (!(await isDirectory(workspacePath))) {
      throw new AppDataRepositoryError(
        'RECENT_PROJECT_PATH_MISSING',
        'The project workspace directory does not exist.',
      );
    }
    const lastOpenedAt = this.#clock.now().toISOString();
    const result = await this.#database.write(requestId, (database) => {
      const pathOwner = database
        .prepare('SELECT project_id FROM recent_projects WHERE workspace_path = ?')
        .get(workspacePath);
      if (pathOwner && pathOwner.project_id !== registration.projectId) {
        throw new AppDataRepositoryError(
          'RECENT_PROJECT_PATH_CONFLICT',
          'The workspace path already belongs to another recent project.',
        );
      }
      database
        .prepare(
          `INSERT INTO recent_projects(
             project_id, workspace_path, display_name, last_opened_at, missing_since
           ) VALUES(?, ?, ?, ?, NULL)
           ON CONFLICT(project_id) DO UPDATE SET
             workspace_path = excluded.workspace_path,
             display_name = excluded.display_name,
             last_opened_at = excluded.last_opened_at,
             missing_since = NULL`,
        )
        .run(registration.projectId, workspacePath, registration.displayName, lastOpenedAt);
      return RecentProjectSchema.parse({
        ...registration,
        workspacePath,
        lastOpenedAt,
        missingSince: null,
      });
    });
    return result.value;
  }

  async list(requestId: string): Promise<readonly RecentProject[]> {
    const projects = this.#readAll();
    const availability = await Promise.all(
      projects.map(async (project) => ({
        project,
        available: await isDirectory(project.workspacePath),
      })),
    );
    const detectedAt = this.#clock.now().toISOString();
    const changes = availability.filter(
      ({ project, available }) => available === (project.missingSince !== null),
    );
    if (changes.length === 0) return projects;

    await this.#database.write(requestId, (database) => {
      const update = database.prepare(
        'UPDATE recent_projects SET missing_since = ? WHERE project_id = ?',
      );
      for (const { project, available } of changes) {
        update.run(available ? null : detectedAt, project.projectId);
      }
    });
    return this.#readAll();
  }

  async relocate(requestId: string, projectId: string, nextPath: string): Promise<RecentProject> {
    const validProjectId = ProjectIdSchema.parse(projectId);
    const workspacePath = normalizedAbsolutePath(nextPath);
    if (!(await isDirectory(workspacePath))) {
      throw new AppDataRepositoryError(
        'RECENT_PROJECT_PATH_MISSING',
        'The replacement workspace directory does not exist.',
      );
    }
    const result = await this.#database.write(requestId, (database) => {
      const current = database
        .prepare('SELECT * FROM recent_projects WHERE project_id = ?')
        .get(validProjectId);
      if (!current) {
        throw new AppDataRepositoryError(
          'RECENT_PROJECT_NOT_FOUND',
          'The recent project record does not exist.',
        );
      }
      const pathOwner = database
        .prepare('SELECT project_id FROM recent_projects WHERE workspace_path = ?')
        .get(workspacePath);
      if (pathOwner && pathOwner.project_id !== validProjectId) {
        throw new AppDataRepositoryError(
          'RECENT_PROJECT_PATH_CONFLICT',
          'The replacement path already belongs to another recent project.',
        );
      }
      database
        .prepare(
          'UPDATE recent_projects SET workspace_path = ?, missing_since = NULL WHERE project_id = ?',
        )
        .run(workspacePath, validProjectId);
      return rowToRecentProject({ ...current, workspace_path: workspacePath, missing_since: null });
    });
    return result.value;
  }

  async remove(requestId: string, projectId: string): Promise<boolean> {
    const validProjectId = ProjectIdSchema.parse(projectId);
    const result = await this.#database.write(requestId, (database) => {
      const removed = database
        .prepare('DELETE FROM recent_projects WHERE project_id = ?')
        .run(validProjectId);
      return Number(removed.changes) > 0;
    });
    return result.value;
  }

  #readAll(): readonly RecentProject[] {
    return this.#database.read((database) =>
      database
        .prepare(
          `SELECT project_id, workspace_path, display_name, last_opened_at, missing_since
             FROM recent_projects
            ORDER BY last_opened_at DESC, display_name COLLATE NOCASE ASC`,
        )
        .all()
        .map(rowToRecentProject),
    );
  }
}
