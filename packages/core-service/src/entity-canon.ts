import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  CanonFactSchema,
  CanonFactSetInputSchema,
  EntityArchiveInputSchema,
  EntityCatalogSchema,
  EntityCreateInputSchema,
  EntityDeleteInputSchema,
  EntityDeletePreviewInputSchema,
  EntityDeletePreviewSchema,
  EntityDeleteResultSchema,
  EntityListInputSchema,
  EntitySchema,
  EntityUpdateInputSchema,
  SceneBeatEntityLinkInputSchema,
  type CanonFact,
  type CanonFactSetInput,
  type Entity,
  type EntityArchiveInput,
  type EntityCatalog,
  type EntityCreateInput,
  type EntityDeleteInput,
  type EntityDeletePreview,
  type EntityDeletePreviewInput,
  type EntityDeleteResult,
  type EntityListInput,
  type EntityUpdateInput,
  type SceneBeatEntityLinkInput,
} from '@worldforge/contracts';
import {
  assertAuthorAuthority,
  normalizeEntityAliases,
  normalizeEntityName,
  normalizeFactKey,
} from '@worldforge/domain';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type EntityCanonServiceErrorCode =
  | 'ENTITY_NOT_FOUND'
  | 'ENTITY_CONFLICT'
  | 'ENTITY_REFERENCED'
  | 'ENTITY_INVALID'
  | 'CANON_AUTHOR_REQUIRED'
  | 'CANON_INVARIANT';

export class EntityCanonServiceError extends Error {
  readonly code: EntityCanonServiceErrorCode;

  constructor(code: EntityCanonServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EntityCanonServiceError';
    this.code = code;
  }
}

export interface EntityCanonServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

interface EntityRow {
  readonly id: string;
  readonly projectId: string;
  readonly entityType: string;
  readonly name: string;
  readonly aliasesJson: string;
  readonly summary: string;
  readonly status: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface FactRow {
  readonly id: string;
  readonly projectId: string;
  readonly entityId: string;
  readonly factKey: string;
  readonly valueJson: string;
  readonly description: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly status: string;
  readonly confirmedAt: string;
  readonly supersededAt: string | null;
  readonly createdAt: string;
}

function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new EntityCanonServiceError('CANON_INVARIANT', 'Persisted Canon text is invalid.');
  }
  return value;
}

function count(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new EntityCanonServiceError('CANON_INVARIANT', 'Persisted Canon count is invalid.');
}

function authorOnly(authority: 'author' | 'ai'): void {
  try {
    assertAuthorAuthority(authority);
  } catch (error) {
    throw new EntityCanonServiceError(
      'CANON_AUTHOR_REQUIRED',
      'Only an explicit author command may change Canon.',
      { cause: error },
    );
  }
}

function assertProject(connection: DatabaseSync, projectId: string): void {
  if (!connection.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    throw new EntityCanonServiceError('ENTITY_NOT_FOUND', 'The project was not found.');
  }
}

function assertNameAvailable(
  connection: DatabaseSync,
  projectId: string,
  entityType: string,
  name: string,
  excludedId?: string,
): void {
  const row = connection
    .prepare(
      `SELECT 1 FROM entities
        WHERE project_id = ? AND entity_type = ? AND status = 'active'
          AND lower(trim(name)) = lower(trim(?))
          AND (? IS NULL OR id <> ?)`,
    )
    .get(projectId, entityType, name, excludedId ?? null, excludedId ?? null);
  if (row) {
    throw new EntityCanonServiceError(
      'ENTITY_CONFLICT',
      'An active Entity with the same type and name already exists.',
    );
  }
}

function entityRow(
  connection: DatabaseSync,
  projectId: string,
  entityId: string,
): EntityRow {
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, entity_type AS entityType, name,
              aliases_json AS aliasesJson, summary, status,
              archived_at AS archivedAt, created_at AS createdAt, updated_at AS updatedAt
         FROM entities WHERE id = ? AND project_id = ?`,
    )
    .get(entityId, projectId) as EntityRow | undefined;
  if (!row) throw new EntityCanonServiceError('ENTITY_NOT_FOUND', 'The Entity was not found.');
  return row;
}

function parseFact(row: FactRow): CanonFact {
  let value: unknown;
  try {
    value = JSON.parse(text(row.valueJson));
  } catch (error) {
    throw new EntityCanonServiceError('CANON_INVARIANT', 'Persisted Canon JSON is invalid.', {
      cause: error,
    });
  }
  return CanonFactSchema.parse({
    id: text(row.id),
    projectId: text(row.projectId),
    entityId: text(row.entityId),
    factKey: text(row.factKey),
    value,
    description: text(row.description),
    sourceType: text(row.sourceType),
    sourceId: row.sourceId === null ? null : text(row.sourceId),
    status: text(row.status),
    confirmedAt: text(row.confirmedAt),
    supersededAt: row.supersededAt === null ? null : text(row.supersededAt),
    createdAt: text(row.createdAt),
  });
}

function factsFor(connection: DatabaseSync, entityId: string): CanonFact[] {
  const rows = connection
    .prepare(
      `SELECT id, project_id AS projectId, entity_id AS entityId, fact_key AS factKey,
              value_json AS valueJson, description, source_type AS sourceType,
              source_id AS sourceId, status, confirmed_at AS confirmedAt,
              superseded_at AS supersededAt, created_at AS createdAt
         FROM canon_facts
        WHERE entity_id = ?
        ORDER BY fact_key, status = 'current' DESC, confirmed_at DESC, id`,
    )
    .all(entityId) as unknown as FactRow[];
  return rows.map(parseFact);
}

function parseEntity(connection: DatabaseSync, row: EntityRow): Entity {
  let aliases: unknown;
  try {
    aliases = JSON.parse(text(row.aliasesJson));
  } catch (error) {
    throw new EntityCanonServiceError('CANON_INVARIANT', 'Persisted Entity aliases are invalid.', {
      cause: error,
    });
  }
  return EntitySchema.parse({
    id: text(row.id),
    projectId: text(row.projectId),
    entityType: text(row.entityType),
    name: text(row.name),
    aliases,
    summary: text(row.summary),
    status: text(row.status),
    archivedAt: row.archivedAt === null ? null : text(row.archivedAt),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    facts: factsFor(connection, row.id),
  });
}

function readCatalog(
  connection: DatabaseSync,
  input: EntityListInput,
): EntityCatalog {
  assertProject(connection, input.projectId);
  const rows = connection
    .prepare(
      `SELECT id, project_id AS projectId, entity_type AS entityType, name,
              aliases_json AS aliasesJson, summary, status,
              archived_at AS archivedAt, created_at AS createdAt, updated_at AS updatedAt
         FROM entities
        WHERE project_id = ? AND (? = 1 OR status = 'active')
        ORDER BY status = 'archived', entity_type, lower(name), id`,
    )
    .all(input.projectId, input.includeArchived ? 1 : 0) as unknown as EntityRow[];
  return EntityCatalogSchema.parse({
    projectId: input.projectId,
    entities: rows.map((row) => parseEntity(connection, row)),
  });
}

export class EntityCanonService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: EntityCanonServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  list(input: EntityListInput): EntityCatalog {
    const valid = EntityListInputSchema.parse(input);
    return this.#workspace.readProject(valid.projectId, (connection) => readCatalog(connection, valid));
  }

  create(requestId: string, input: EntityCreateInput): Promise<EntityCatalog> {
    const valid = EntityCreateInputSchema.parse(input);
    authorOnly(valid.authority);
    const name = normalizeEntityName(valid.name);
    const aliases = normalizeEntityAliases(valid.aliases);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      assertProject(connection, valid.projectId);
      assertNameAvailable(connection, valid.projectId, valid.entityType, name);
      const now = this.#clock.now().toISOString();
      connection
        .prepare(
          `INSERT INTO entities(
             id, project_id, entity_type, name, aliases_json, summary,
             status, archived_at, created_at, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)`,
        )
        .run(
          this.#idFactory(),
          valid.projectId,
          valid.entityType,
          name,
          JSON.stringify(aliases),
          valid.summary.trim(),
          now,
          now,
        );
      return readCatalog(connection, { projectId: valid.projectId, includeArchived: true });
    });
  }

  update(requestId: string, input: EntityUpdateInput): Promise<EntityCatalog> {
    const valid = EntityUpdateInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = entityRow(connection, valid.projectId, valid.entityId);
      const entityType = valid.patch.entityType ?? current.entityType;
      const name = valid.patch.name ? normalizeEntityName(valid.patch.name) : current.name;
      if (current.status === 'active') {
        assertNameAvailable(connection, valid.projectId, entityType, name, valid.entityId);
      }
      const aliases = valid.patch.aliases
        ? normalizeEntityAliases(valid.patch.aliases)
        : (JSON.parse(current.aliasesJson) as string[]);
      const summary = valid.patch.summary?.trim() ?? current.summary;
      connection
        .prepare(
          `UPDATE entities
              SET entity_type = ?, name = ?, aliases_json = ?, summary = ?, updated_at = ?
            WHERE id = ? AND project_id = ?`,
        )
        .run(
          entityType,
          name,
          JSON.stringify(aliases),
          summary,
          this.#clock.now().toISOString(),
          valid.entityId,
          valid.projectId,
        );
      return readCatalog(connection, { projectId: valid.projectId, includeArchived: true });
    });
  }

  archive(requestId: string, input: EntityArchiveInput): Promise<EntityCatalog> {
    const valid = EntityArchiveInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = entityRow(connection, valid.projectId, valid.entityId);
      if (current.status !== 'archived') {
        const now = this.#clock.now().toISOString();
        connection
          .prepare(
            `UPDATE entities
                SET status = 'archived', archived_at = ?, updated_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(now, now, valid.entityId, valid.projectId);
      }
      return readCatalog(connection, { projectId: valid.projectId, includeArchived: true });
    });
  }

  setFact(requestId: string, input: CanonFactSetInput): Promise<EntityCatalog> {
    const valid = CanonFactSetInputSchema.parse(input);
    authorOnly(valid.authority);
    const factKey = normalizeFactKey(valid.factKey);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const entity = entityRow(connection, valid.projectId, valid.entityId);
      if (entity.status !== 'active') {
        throw new EntityCanonServiceError('ENTITY_CONFLICT', 'Archived Entities cannot receive new facts.');
      }
      const now = this.#clock.now().toISOString();
      connection
        .prepare(
          `UPDATE canon_facts
              SET status = 'historical', superseded_at = ?
            WHERE entity_id = ? AND fact_key = ? AND status = 'current'`,
        )
        .run(now, valid.entityId, factKey);
      connection
        .prepare(
          `INSERT INTO canon_facts(
             id, project_id, entity_id, fact_key, value_json, description,
             source_type, source_id, status, confirmed_at, superseded_at, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, NULL, ?)`,
        )
        .run(
          this.#idFactory(),
          valid.projectId,
          valid.entityId,
          factKey,
          JSON.stringify(valid.value),
          valid.description.trim(),
          valid.sourceType,
          valid.sourceId,
          now,
          now,
        );
      return readCatalog(connection, { projectId: valid.projectId, includeArchived: true });
    });
  }

  linkSceneBeat(requestId: string, input: SceneBeatEntityLinkInput): Promise<EntityCatalog> {
    const valid = SceneBeatEntityLinkInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const entity = entityRow(connection, valid.projectId, valid.entityId);
      if (entity.status !== 'active') {
        throw new EntityCanonServiceError('ENTITY_CONFLICT', 'Archived Entities cannot receive references.');
      }
      const beat = connection
        .prepare('SELECT 1 FROM scene_beats WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
        .get(valid.sceneBeatId, valid.projectId);
      if (!beat) {
        throw new EntityCanonServiceError('ENTITY_NOT_FOUND', 'The active SceneBeat was not found.');
      }
      connection
        .prepare(
          `INSERT OR IGNORE INTO scene_beat_entities(
             project_id, scene_beat_id, entity_id, role, created_at
           ) VALUES(?, ?, ?, ?, ?)`,
        )
        .run(
          valid.projectId,
          valid.sceneBeatId,
          valid.entityId,
          valid.role,
          this.#clock.now().toISOString(),
        );
      return readCatalog(connection, { projectId: valid.projectId, includeArchived: true });
    });
  }

  previewDelete(input: EntityDeletePreviewInput): EntityDeletePreview {
    const valid = EntityDeletePreviewInputSchema.parse(input);
    return this.#workspace.readProject(valid.projectId, (connection) => {
      const entity = entityRow(connection, valid.projectId, valid.entityId);
      const sceneBeatReferenceCount = count(
        connection
          .prepare('SELECT COUNT(*) AS total FROM scene_beat_entities WHERE entity_id = ?')
          .get(valid.entityId)?.total,
      );
      const canonFactCount = count(
        connection.prepare('SELECT COUNT(*) AS total FROM canon_facts WHERE entity_id = ?').get(valid.entityId)
          ?.total,
      );
      const blockers: string[] = [];
      if (entity.status !== 'archived') blockers.push('Archive the Entity before permanent deletion.');
      if (sceneBeatReferenceCount > 0) blockers.push('Remove SceneBeat references before permanent deletion.');
      return EntityDeletePreviewSchema.parse({
        projectId: valid.projectId,
        entityId: valid.entityId,
        entityName: entity.name,
        archived: entity.status === 'archived',
        sceneBeatReferenceCount,
        canonFactCount,
        canDelete: blockers.length === 0,
        blockers,
      });
    });
  }

  delete(requestId: string, input: EntityDeleteInput): Promise<EntityDeleteResult> {
    const valid = EntityDeleteInputSchema.parse(input);
    authorOnly(valid.authority);
    const preview = this.previewDelete({ projectId: valid.projectId, entityId: valid.entityId });
    if (!preview.canDelete) {
      throw new EntityCanonServiceError('ENTITY_REFERENCED', preview.blockers.join(' '));
    }
    if (normalizeEntityName(valid.confirmName) !== preview.entityName) {
      throw new EntityCanonServiceError('ENTITY_INVALID', 'Entity name confirmation does not match.');
    }
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const result = connection
        .prepare('DELETE FROM entities WHERE id = ? AND project_id = ? AND status = \'archived\'')
        .run(valid.entityId, valid.projectId);
      if (Number(result.changes) !== 1) {
        throw new EntityCanonServiceError('ENTITY_CONFLICT', 'The Entity could not be deleted.');
      }
      return EntityDeleteResultSchema.parse({
        projectId: valid.projectId,
        entityId: valid.entityId,
        deleted: true,
      });
    });
  }
}
