import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { MutationOrigin } from '@worldforge/contracts';

export const DEFAULT_RHYTHM_PROFILE = {
  enabled: true,
  excitementMinPer1000: 0.5,
  excitementMaxPer1000: 3,
  hookEnabled: true,
  goldenThreeEnabled: true,
  targetDailyCharacters: 3_000,
  idleThresholdSeconds: 300,
} as const;

function dayKey(timestamp: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return timestamp.slice(0, 10);
  }
}

export function ensureRhythmProfile(
  database: DatabaseSync,
  projectId: string,
  timestamp: string,
): void {
  const project = database.prepare('SELECT channel FROM projects WHERE id = ?').get(projectId) as
    { readonly channel?: unknown } | undefined;
  if (typeof project?.channel !== 'string') throw new Error('RHYTHM_PROJECT_NOT_FOUND');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  database
    .prepare(
      `INSERT OR IGNORE INTO genre_rhythm_profiles(
         project_id, channel, enabled, excitement_min_per_1000,
         excitement_max_per_1000, hook_enabled, golden_three_enabled,
         target_daily_characters, idle_threshold_seconds, time_zone,
         statistics_started_at, updated_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      project.channel,
      DEFAULT_RHYTHM_PROFILE.enabled ? 1 : 0,
      DEFAULT_RHYTHM_PROFILE.excitementMinPer1000,
      DEFAULT_RHYTHM_PROFILE.excitementMaxPer1000,
      DEFAULT_RHYTHM_PROFILE.hookEnabled ? 1 : 0,
      DEFAULT_RHYTHM_PROFILE.goldenThreeEnabled ? 1 : 0,
      DEFAULT_RHYTHM_PROFILE.targetDailyCharacters,
      DEFAULT_RHYTHM_PROFILE.idleThresholdSeconds,
      timeZone,
      timestamp,
      timestamp,
    );
}

export function recordDraftMutation(
  database: DatabaseSync,
  input: {
    readonly projectId: string;
    readonly chapterId: string;
    readonly draftId: string;
    readonly origin: MutationOrigin;
    readonly beforeCharacters: number;
    readonly afterCharacters: number;
    readonly timestamp: string;
    readonly idFactory?: () => string;
  },
): void {
  if (input.origin !== 'manual_edit') return;
  ensureRhythmProfile(database, input.projectId, input.timestamp);
  const profile = database
    .prepare(
      `SELECT idle_threshold_seconds AS idleThresholdSeconds, time_zone AS timeZone
         FROM genre_rhythm_profiles WHERE project_id = ?`,
    )
    .get(input.projectId) as {
    readonly idleThresholdSeconds: number | bigint;
    readonly timeZone: string;
  };
  const currentDay = dayKey(input.timestamp, profile.timeZone);
  const latest = database
    .prepare(
      `SELECT id, day_key AS dayKey, last_input_at AS lastInputAt
         FROM writing_sessions
        WHERE project_id = ? AND draft_id = ?
        ORDER BY last_input_at DESC, id DESC LIMIT 1`,
    )
    .get(input.projectId, input.draftId) as
    { readonly id: string; readonly dayKey: string; readonly lastInputAt: string } | undefined;
  const netCharacters = input.afterCharacters - input.beforeCharacters;
  const idleSeconds = Number(profile.idleThresholdSeconds);
  const elapsedSeconds = latest
    ? Math.max(
        0,
        Math.floor(
          (new Date(input.timestamp).getTime() - new Date(latest.lastInputAt).getTime()) / 1_000,
        ),
      )
    : Number.POSITIVE_INFINITY;
  if (latest && latest.dayKey === currentDay && elapsedSeconds <= idleSeconds) {
    database
      .prepare(
        `UPDATE writing_sessions
            SET last_input_at = ?, active_seconds = active_seconds + ?,
                net_characters = net_characters + ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(input.timestamp, Math.max(1, elapsedSeconds), netCharacters, input.timestamp, latest.id);
    return;
  }
  database
    .prepare(
      `INSERT INTO writing_sessions(
         id, project_id, chapter_id, draft_id, day_key, started_at,
         last_input_at, active_seconds, net_characters, created_at, updated_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(
      (input.idFactory ?? randomUUID)(),
      input.projectId,
      input.chapterId,
      input.draftId,
      currentDay,
      input.timestamp,
      input.timestamp,
      netCharacters,
      input.timestamp,
      input.timestamp,
    );
}
