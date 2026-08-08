import type { DatabaseSync } from 'node:sqlite';

export interface EntityReferenceBlocker {
  readonly source: string;
  readonly count: number;
  readonly deleteAction: 'RESTRICT' | 'NO ACTION';
}

interface ForeignKeyRow {
  readonly id: number | bigint;
  readonly seq: number | bigint;
  readonly table: string;
  readonly from: string;
  readonly to: string;
  readonly on_delete: string;
}

function safeIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new Error('ENTITY_REFERENCE_SCHEMA_IDENTIFIER_INVALID');
  }
  return `"${value}"`;
}

function numberValue(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

export function entityReferenceBlockers(
  database: DatabaseSync,
  projectId: string,
  entityId: string,
): EntityReferenceBlocker[] {
  const tables = (
    database
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name`,
      )
      .all() as { readonly name: string }[]
  ).map((row) => row.name);
  const blockers: EntityReferenceBlocker[] = [];

  for (const table of tables) {
    const rows = database.prepare(`PRAGMA foreign_key_list(${safeIdentifier(table)})`).all() as unknown as
      ForeignKeyRow[];
    const groups = new Map<number, ForeignKeyRow[]>();
    for (const row of rows) {
      if (row.table !== 'entities') continue;
      const id = numberValue(row.id);
      groups.set(id, [...(groups.get(id) ?? []), row]);
    }
    for (const group of groups.values()) {
      const entityColumn = group.find((row) => row.to === 'id')?.from;
      if (!entityColumn) continue;
      const action = group[0]?.on_delete.toUpperCase();
      if (action !== 'RESTRICT' && action !== 'NO ACTION') continue;
      const projectColumn = group.find((row) => row.to === 'project_id')?.from;
      const where = projectColumn
        ? `${safeIdentifier(entityColumn)} = ? AND ${safeIdentifier(projectColumn)} = ?`
        : `${safeIdentifier(entityColumn)} = ?`;
      const parameters = projectColumn ? [entityId, projectId] : [entityId];
      const countRow = database
        .prepare(`SELECT COUNT(*) AS count FROM ${safeIdentifier(table)} WHERE ${where}`)
        .get(...parameters) as { readonly count: number | bigint };
      const count = numberValue(countRow.count);
      if (count === 0) continue;
      blockers.push({
        source: `${table}.${entityColumn}`,
        count,
        deleteAction: action,
      });
    }
  }

  return blockers.sort((left, right) => left.source.localeCompare(right.source, 'en'));
}

export function entityReferenceBlockerMessage(blocker: EntityReferenceBlocker): string {
  switch (blocker.source) {
    case 'scene_beat_entities.entity_id':
      return 'Remove SceneBeat references before permanent deletion.';
    case 'timeline_events.location_id':
      return 'Remove Timeline location references before permanent deletion.';
    case 'timeline_event_entities.entity_id':
      return 'Remove Timeline entity references before permanent deletion.';
    case 'character_arcs.character_id':
      return 'Remove Character Arc references before permanent deletion.';
    case 'state_proposals.entity_id':
      return 'Resolve the StateProposal retention dependency before permanent deletion.';
    default:
      return `Remove ${blocker.source} references before permanent deletion.`;
  }
}
