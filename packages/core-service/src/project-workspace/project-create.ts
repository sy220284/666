import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  ProjectCreateInputSchema,
  ProjectWorkspaceManifestSchema,
  type ProjectCreateInput,
  type ProjectWorkspaceSummary,
} from "@worldforge/contracts";

import {
  ProjectDatabase,
  latestMigrationVersion,
  loadMigrations,
} from "../database/index.js";
import { initializeProjectStructure } from "../project-structure.js";
import {
  existingDirectory,
  isPermissionFailure,
  ProjectWorkspaceError,
  validWorkspaceName,
  workspaceExists,
} from "./workspace-path-policy.js";
import {
  loadWorkspace,
  type ProjectWorkspaceOperationContext,
} from "./workspace-verifier.js";

function initializeOnboardingContent(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string | null,
  input: ProjectCreateInput["onboarding"],
  createdAt: string,
  idFactory: () => string,
): void {
  if (!input) return;

  if (input.brief) {
    connection
      .prepare(
        `INSERT INTO project_briefs(
           id, project_id, concept, reading_promise, protagonist_goal, core_conflict,
           ending_intent, required_json, forbidden_json, updated_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        idFactory(),
        projectId,
        input.brief.concept,
        input.brief.readingPromise,
        input.brief.protagonistGoal,
        input.brief.coreConflict,
        input.brief.endingIntent,
        JSON.stringify(input.brief.required),
        JSON.stringify(input.brief.forbidden),
        createdAt,
      );
  }

  if (input.protagonist) {
    const summary = [
      input.protagonist.identity,
      input.protagonist.goal,
      input.protagonist.boundary,
    ]
      .filter(Boolean)
      .join("；");
    connection
      .prepare(
        `INSERT INTO entities(
           id, project_id, entity_type, name, aliases_json, summary, status,
           archived_at, created_at, updated_at
         ) VALUES(?, ?, 'character', ?, '[]', ?, 'active', NULL, ?, ?)`,
      )
      .run(
        idFactory(),
        projectId,
        input.protagonist.name,
        summary,
        createdAt,
        createdAt,
      );
  }

  if (!chapterId) return;
  if (input.firstChapter) {
    connection
      .prepare(
        `UPDATE chapters
            SET title = ?, target_word_min = ?, target_word_max = ?
          WHERE id = ?`,
      )
      .run(
        input.firstChapter.title,
        input.firstChapter.targetWordMin,
        input.firstChapter.targetWordMax,
        chapterId,
      );
  }

  if (input.sceneGoals.length === 0) return;
  const basePercent = Math.floor(100 / input.sceneGoals.length);
  for (const [index, goal] of input.sceneGoals.entries()) {
    const last = index === input.sceneGoals.length - 1;
    connection
      .prepare(
        `INSERT INTO scene_beats(
           id, project_id, chapter_id, plot_node_id, title, goal, core_conflict,
           expected_result, beat_type, word_target_percent, is_required, order_key,
           character_ids_json, location_ids_json, deleted_at, updated_at
         ) VALUES(?, ?, ?, NULL, ?, ?, '', '', ?, ?, 1, ?, '[]', '[]', NULL, ?)`,
      )
      .run(
        idFactory(),
        projectId,
        chapterId,
        `场景${index + 1}`,
        goal,
        last ? "turn" : index === 0 ? "setup" : "development",
        last ? 100 - basePercent * index : basePercent,
        (index + 1) * 1024,
        createdAt,
      );
  }
}

export async function createProjectWorkspace(
  runtime: ProjectWorkspaceOperationContext,
  requestId: string,
  input: ProjectCreateInput,
  parentDirectory: string,
): Promise<ProjectWorkspaceSummary> {
  runtime.assertNoActive();
  const project = ProjectCreateInputSchema.parse(input);
  const parent = await existingDirectory(parentDirectory, true);
  const workspaceName = validWorkspaceName(project.name);
  const finalPath = path.join(parent, workspaceName);
  const stagingPath = path.join(
    parent,
    `.${workspaceName}.create-${runtime.idFactory()}`,
  );
  if (await workspaceExists(finalPath)) {
    throw new ProjectWorkspaceError(
      "PROJECT_TARGET_CONFLICT",
      "A project workspace with the same name already exists.",
    );
  }

  const projectId = runtime.idFactory();
  const createdAt = runtime.clock.now().toISOString();
  let renamed = false;
  try {
    await mkdir(stagingPath, { mode: 0o700 });
    await chmod(stagingPath, 0o700);
    const migrations = await loadMigrations(
      runtime.migrationsDirectory,
      "project",
    );
    const projectSchemaVersion = latestMigrationVersion(migrations);
    const databasePath = path.join(stagingPath, "project.sqlite");
    const database = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: runtime.appVersion,
      clock: runtime.clock,
    });
    try {
      if (
        database.mode !== "read-write" ||
        database.schemaVersion !== projectSchemaVersion
      ) {
        throw new ProjectWorkspaceError(
          "PROJECT_CREATE_FAILED",
          "A new project database did not reach the latest registered schema version.",
        );
      }
      await database.write(requestId, (connection) => {
        connection
          .prepare(
            `INSERT INTO projects(
                   id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
                 ) VALUES(?, ?, ?, NULL, ?, ?, ?)`,
          )
          .run(
            projectId,
            project.name,
            project.channel,
            database.schemaVersion,
            createdAt,
            createdAt,
          );
        const structure = initializeProjectStructure(
          connection,
          projectId,
          project.initialStructure ?? "starter",
          createdAt,
          runtime.idFactory,
        );
        initializeOnboardingContent(
          connection,
          projectId,
          structure?.chapterId ?? null,
          project.onboarding,
          createdAt,
          runtime.idFactory,
        );
      });
      await database.checkpoint("TRUNCATE");
    } finally {
      await database.close();
    }
    await chmod(databasePath, 0o600);
    const manifest = ProjectWorkspaceManifestSchema.parse({
      format: "worldforge-project",
      manifestVersion: 1,
      projectId,
      displayName: project.name,
      databaseFile: "project.sqlite",
      projectSchemaVersion,
      createdAt,
    });
    await writeFile(
      path.join(stagingPath, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    await rename(stagingPath, finalPath);
    renamed = true;
    const context = await loadWorkspace(runtime, finalPath);
    await runtime.registerRecentBestEffort(requestId, context.summary);
    runtime.active = context;
    return context.summary;
  } catch (error) {
    if (!renamed && !runtime.active) {
      await rm(stagingPath, { recursive: true, force: true });
    }
    if (error instanceof ProjectWorkspaceError) throw error;
    if (isPermissionFailure(error)) {
      throw new ProjectWorkspaceError(
        "PROJECT_DIRECTORY_READ_ONLY",
        "The project workspace could not be created in the selected directory.",
        { cause: error },
      );
    }
    throw new ProjectWorkspaceError(
      "PROJECT_CREATE_FAILED",
      "The project workspace could not be created safely.",
      { cause: error },
    );
  }
}
