import type { DatabaseSync } from 'node:sqlite';

export type ProjectCloneAction = 'clone-remap' | 'preserve' | 'drop' | 'regenerate' | 'identity';

const PROJECT_CLONE_POLICY = new Map<string, ProjectCloneAction>([
  ['schema_migrations', 'identity'],
  ['migration_journal', 'drop'],
  ['projects', 'identity'],
  ['volumes', 'clone-remap'],
  ['chapters', 'preserve'],
  ['trash_entries', 'preserve'],
  ['drafts', 'preserve'],
  ['draft_blocks', 'preserve'],
  ['draft_patch_log', 'preserve'],
  ['versions', 'preserve'],
  ['version_blocks', 'preserve'],
  ['backup_records', 'drop'],
  ['candidates', 'preserve'],
  ['candidate_blocks', 'preserve'],
  ['candidate_block_sources', 'preserve'],
  ['candidate_apply_checkpoints', 'preserve'],
  ['candidate_apply_records', 'preserve'],
  ['candidate_conflict_sets', 'preserve'],
  ['project_briefs', 'clone-remap'],
  ['plot_nodes', 'clone-remap'],
  ['scene_beats', 'clone-remap'],
  ['scene_beat_block_links', 'preserve'],
  ['entities', 'clone-remap'],
  ['canon_facts', 'clone-remap'],
  ['scene_beat_entities', 'clone-remap'],
  ['entity_states', 'clone-remap'],
  ['timeline_events', 'clone-remap'],
  ['timeline_event_entities', 'clone-remap'],
  ['timeline_event_dependencies', 'clone-remap'],
  ['knowledge_states', 'clone-remap'],
  ['character_relationships', 'clone-remap'],
  ['foreshadowings', 'clone-remap'],
  ['foreshadowing_chapters', 'clone-remap'],
  ['foreshadowing_relations', 'clone-remap'],
  ['character_arcs', 'clone-remap'],
  ['arc_milestones', 'clone-remap'],
  ['arc_milestone_dependencies', 'clone-remap'],
  ['arc_milestone_timeline_dependencies', 'clone-remap'],
  ['state_proposals', 'clone-remap'],
  ['ending_snapshots', 'regenerate'],
  ['derived_invalidations', 'regenerate'],
  ['scene_beat_link_rebind_queue', 'regenerate'],
  ['search_index_state', 'regenerate'],
  ['search_index_queue', 'regenerate'],
  ['fts_draft_blocks', 'regenerate'],
  ['fts_version_blocks', 'regenerate'],
  ['fts_entities', 'regenerate'],
  ['project_dictionary', 'preserve'],
  ['project_settings', 'preserve'],
  ['generation_runs', 'clone-remap'],
  ['generation_constraint_packages', 'preserve'],
  ['generation_result_refs', 'preserve'],
  ['generation_partial_buffers', 'drop'],
  ['model_support_profiles', 'preserve'],
  ['candidate_skeleton_revisions', 'preserve'],
  ['generation_input_sources', 'preserve'],
  ['candidate_source_mappings', 'preserve'],
  ['idea_cards', 'clone-remap'],
  ['idea_conversions', 'clone-remap'],
  ['state_proposal_batches', 'clone-remap'],
  ['validation_batches', 'clone-remap'],
  ['validation_issues', 'clone-remap'],
  ['validation_exceptions', 'clone-remap'],
  ['story_todos', 'clone-remap'],
  ['story_comments', 'clone-remap'],
  ['replace_plans', 'drop'],
  ['replace_plan_items', 'drop'],
  ['genre_rhythm_profiles', 'clone-remap'],
  ['writing_sessions', 'clone-remap'],
  ['backup_policies', 'clone-remap'],
  ['backup_failures', 'drop'],
  ['command_receipts', 'drop'],
  ['semantic_revision', 'regenerate'],
]);

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function schemaTables(database: DatabaseSync): readonly { name: string; sql: string | null }[] {
  return database
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => ({
      name: String(row.name),
      sql: row.sql === null || row.sql === undefined ? null : String(row.sql),
    }));
}

export function projectCloneTables(database: DatabaseSync): readonly string[] {
  const rows = schemaTables(database);
  const virtualRoots = rows
    .filter((row) => /^CREATE\s+VIRTUAL\s+TABLE\b/iu.test(row.sql ?? ''))
    .map((row) => row.name);
  const tables = rows
    .map((row) => row.name)
    .filter(
      (name) =>
        !virtualRoots.some((root) => name !== root && name.startsWith(`${root}_`)),
    )
    .sort((left, right) => left.localeCompare(right, 'en'));
  const unknown = tables.filter((table) => !PROJECT_CLONE_POLICY.has(table));
  if (unknown.length > 0) {
    throw new Error(`PROJECT_CLONE_POLICY_INCOMPLETE unknown=${unknown.join(',')}`);
  }
  return tables;
}

export function projectCloneAction(table: string): ProjectCloneAction {
  const action = PROJECT_CLONE_POLICY.get(table);
  if (!action) throw new Error(`PROJECT_CLONE_POLICY_INCOMPLETE unknown=${table}`);
  return action;
}

function deleteAll(database: DatabaseSync, available: ReadonlySet<string>, table: string): void {
  if (!available.has(table)) return;
  database.exec(`DELETE FROM ${quoteIdentifier(table)}`);
}

export function prepareProjectClone(database: DatabaseSync, timestamp: string): void {
  const available = new Set(projectCloneTables(database));

  deleteAll(database, available, 'replace_plan_items');
  deleteAll(database, available, 'replace_plans');
  deleteAll(database, available, 'generation_partial_buffers');
  deleteAll(database, available, 'scene_beat_link_rebind_queue');
  deleteAll(database, available, 'ending_snapshots');
  deleteAll(database, available, 'derived_invalidations');
  deleteAll(database, available, 'backup_failures');
  deleteAll(database, available, 'backup_records');
  deleteAll(database, available, 'migration_journal');
  deleteAll(database, available, 'command_receipts');
  deleteAll(database, available, 'semantic_revision');

  for (const table of ['fts_draft_blocks', 'fts_version_blocks', 'fts_entities']) {
    deleteAll(database, available, table);
  }
  deleteAll(database, available, 'search_index_queue');
  if (available.has('search_index_state')) {
    database
      .prepare(
        `UPDATE search_index_state
            SET status = 'stale',
                last_indexed_at = NULL,
                stale_at = ?,
                last_error_code = NULL,
                updated_at = ?
          WHERE singleton_id = 1`,
      )
      .run(timestamp, timestamp);
  }

  if (available.has('generation_runs')) {
    database
      .prepare(
        `UPDATE generation_runs
            SET status = 'cancelled',
                stage = 'cancelled',
                partial_status = CASE
                  WHEN partial_status = 'unavailable' THEN 'unavailable'
                  ELSE 'discarded'
                END,
                finished_at = COALESCE(finished_at, ?),
                error_code = NULL,
                retryable = NULL
          WHERE status IN ('queued', 'running')`,
      )
      .run(timestamp);
    database.exec(
      `UPDATE generation_runs
          SET partial_status = 'discarded'
        WHERE status NOT IN ('queued', 'running')
          AND partial_status IN ('available', 'saved')`,
    );
  }
}

export function remapProjectScopedDerivedIdentity(
  database: DatabaseSync,
  previousProjectId: string,
  nextProjectId: string,
): void {
  const available = new Set(projectCloneTables(database));
  if (available.has('generation_runs')) {
    database
      .prepare(
        `UPDATE generation_runs
            SET scope_id = ?
          WHERE scope_type = 'project' AND scope_id = ?`,
      )
      .run(nextProjectId, previousProjectId);
  }
  if (available.has('idea_cards')) {
    database
      .prepare(
        `UPDATE idea_cards
            SET source_context_json = json_set(source_context_json, '$.scopeId', ?)
          WHERE json_extract(source_context_json, '$.scopeType') = 'project'
            AND json_extract(source_context_json, '$.scopeId') = ?`,
      )
      .run(nextProjectId, previousProjectId);
  }
}

export function finalizeProjectClone(database: DatabaseSync, projectId: string): void {
  const available = new Set(projectCloneTables(database));
  if (!available.has('semantic_revision')) return;
  database
    .prepare(
      `INSERT INTO semantic_revision(project_id, revision)
       VALUES(?, 0)
       ON CONFLICT(project_id) DO UPDATE SET revision = 0`,
    )
    .run(projectId);
}
