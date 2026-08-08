import type { DatabaseSync } from 'node:sqlite';

import {
  GenreRhythmProfileSchema,
  RhythmDashboardSchema,
  RhythmProfileUpdateInputSchema,
  type GenreRhythmProfile,
  type RhythmDashboard,
  type RhythmProfileUpdateInput,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { DEFAULT_RHYTHM_PROFILE, ensureRhythmProfile } from './writing-metrics.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type RhythmServiceErrorCode =
  'RHYTHM_NOT_FOUND' | 'RHYTHM_INVALID' | 'RHYTHM_AUTHOR_REQUIRED';

export class RhythmServiceError extends Error {
  readonly code: RhythmServiceErrorCode;
  constructor(code: RhythmServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RhythmServiceError';
    this.code = code;
  }
}

interface ProfileRow {
  readonly projectId: string;
  readonly channel: string;
  readonly enabled: number | bigint;
  readonly excitementMinPer1000: number;
  readonly excitementMaxPer1000: number;
  readonly hookEnabled: number | bigint;
  readonly goldenThreeEnabled: number | bigint;
  readonly targetDailyCharacters: number | bigint;
  readonly idleThresholdSeconds: number | bigint;
  readonly timeZone: string;
  readonly statisticsStartedAt: string;
  readonly updatedAt: string;
}

function defaultProfile(database: DatabaseSync, projectId: string): GenreRhythmProfile {
  const project = database
    .prepare(
      `SELECT channel, created_at AS createdAt
         FROM projects WHERE id = ?`,
    )
    .get(projectId) as { readonly channel: string; readonly createdAt: string } | undefined;
  if (!project) throw new RhythmServiceError('RHYTHM_NOT_FOUND', 'Rhythm project not found.');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return GenreRhythmProfileSchema.parse({
    projectId,
    channel: project.channel,
    ...DEFAULT_RHYTHM_PROFILE,
    timeZone,
    statisticsStartedAt: project.createdAt,
    updatedAt: project.createdAt,
  });
}

function profile(database: DatabaseSync, projectId: string): GenreRhythmProfile {
  const row = database
    .prepare(
      `SELECT project_id AS projectId, channel, enabled,
              excitement_min_per_1000 AS excitementMinPer1000,
              excitement_max_per_1000 AS excitementMaxPer1000,
              hook_enabled AS hookEnabled, golden_three_enabled AS goldenThreeEnabled,
              target_daily_characters AS targetDailyCharacters,
              idle_threshold_seconds AS idleThresholdSeconds, time_zone AS timeZone,
              statistics_started_at AS statisticsStartedAt, updated_at AS updatedAt
         FROM genre_rhythm_profiles WHERE project_id = ?`,
    )
    .get(projectId) as ProfileRow | undefined;
  if (!row) return defaultProfile(database, projectId);
  return GenreRhythmProfileSchema.parse({
    ...row,
    enabled: Boolean(row.enabled),
    hookEnabled: Boolean(row.hookEnabled),
    goldenThreeEnabled: Boolean(row.goldenThreeEnabled),
    targetDailyCharacters: Number(row.targetDailyCharacters),
    idleThresholdSeconds: Number(row.idleThresholdSeconds),
  });
}

function dayKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (error) {
    throw new RhythmServiceError('RHYTHM_INVALID', 'The rhythm time zone is invalid.', {
      cause: error,
    });
  }
}

function dashboard(database: DatabaseSync, projectId: string, now: Date): RhythmDashboard {
  const activeProfile = profile(database, projectId);
  const days = (
    database
      .prepare(
        `SELECT day_key AS day,
                SUM(net_characters) AS manualNetCharacters,
                SUM(active_seconds) AS effectiveSeconds
           FROM writing_sessions WHERE project_id = ?
          GROUP BY day_key ORDER BY day_key DESC LIMIT 366`,
      )
      .all(projectId) as unknown as Array<{
      readonly day: string;
      readonly manualNetCharacters: number | bigint;
      readonly effectiveSeconds: number | bigint;
    }>
  ).map((row) => ({
    day: row.day,
    manualNetCharacters: Number(row.manualNetCharacters),
    effectiveSeconds: Number(row.effectiveSeconds),
  }));
  const todayKey = dayKey(now, activeProfile.timeZone);
  const today = days.find((day) => day.day === todayKey) ?? {
    day: todayKey,
    manualNetCharacters: 0,
    effectiveSeconds: 0,
  };
  const chapterRows = database
    .prepare(
      `SELECT chapter.id AS chapterId, chapter.title,
              chapter.active_draft_id AS activeDraftId
         FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
        ORDER BY volume.order_key, chapter.order_key, chapter.id`,
    )
    .all(projectId) as unknown as Array<{
    readonly chapterId: string;
    readonly title: string;
    readonly activeDraftId: string | null;
  }>;
  const chapters = chapterRows.map((chapter, index) => {
    const texts = chapter.activeDraftId
      ? (
          database
            .prepare(
              `SELECT text FROM draft_blocks WHERE draft_id = ?
                ORDER BY order_key, id`,
            )
            .all(chapter.activeDraftId) as unknown as Array<{ readonly text: string }>
        ).map((row) => row.text)
      : [];
    const characterCount = texts.reduce((total, text) => total + Array.from(text).length, 0);
    const beat = database
      .prepare(
        `SELECT COUNT(*) AS count FROM scene_beats
          WHERE project_id = ? AND chapter_id = ? AND deleted_at IS NULL
            AND (beat_type IN ('turn', 'climax') OR length(trim(core_conflict)) > 0)`,
      )
      .get(projectId, chapter.chapterId) as { readonly count: number | bigint };
    const excitementBeatCount = Number(beat.count);
    const lastText =
      [...texts]
        .reverse()
        .find((text) => text.trim())
        ?.trim() ?? '';
    const endingHookDetected =
      /[？！?!…]$/u.test(lastText) ||
      /(忽然|竟然|却|没想到|下一刻|门外|身后)/u.test(lastText.slice(-80));
    return {
      chapterId: chapter.chapterId,
      title: chapter.title,
      ordinal: index + 1,
      inGoldenThree: activeProfile.goldenThreeEnabled && index < 3,
      characterCount,
      excitementBeatCount,
      excitementPer1000: characterCount === 0 ? 0 : (excitementBeatCount * 1_000) / characterCount,
      endingHookDetected,
    };
  });
  const suggestions: RhythmDashboard['suggestions'][number][] = [];
  if (activeProfile.enabled) {
    for (const chapter of chapters) {
      if (
        chapter.characterCount > 0 &&
        (chapter.excitementPer1000 < activeProfile.excitementMinPer1000 ||
          chapter.excitementPer1000 > activeProfile.excitementMaxPer1000)
      ) {
        suggestions.push({
          suggestionId: `density:${chapter.chapterId}`,
          chapterId: chapter.chapterId,
          kind: 'excitement_density',
          priority: 'P3',
          message: `爽点/转折密度约 ${chapter.excitementPer1000.toFixed(2)}/千字，超出当前频道参考区间。`,
          evidence: [
            `${chapter.excitementBeatCount} 个冲突、反转或高潮节点`,
            `${chapter.characterCount} 字`,
          ],
        });
      }
      if (activeProfile.hookEnabled && chapter.characterCount > 0 && !chapter.endingHookDetected) {
        suggestions.push({
          suggestionId: `hook:${chapter.chapterId}`,
          chapterId: chapter.chapterId,
          kind: 'ending_hook',
          priority: 'P3',
          message: '规则未识别出明确章末悬念或转折；请按本章功能自行判断。',
          evidence: ['当前稿最后一个非空正文块'],
        });
      }
      if (
        chapter.inGoldenThree &&
        chapter.characterCount > 0 &&
        chapter.excitementBeatCount === 0
      ) {
        suggestions.push({
          suggestionId: `golden:${chapter.chapterId}`,
          chapterId: chapter.chapterId,
          kind: 'golden_three',
          priority: 'P3',
          message: '黄金三章范围内尚未记录冲突、反转或高潮 SceneBeat。',
          evidence: [`第 ${chapter.ordinal} 个有效章节`, '权威卷章排序'],
        });
      }
    }
    if (today.manualNetCharacters < activeProfile.targetDailyCharacters) {
      suggestions.push({
        suggestionId: `pace:${today.day}`,
        chapterId: null,
        kind: 'update_pace',
        priority: 'P3',
        message: `今日人工净增 ${today.manualNetCharacters} 字，目标 ${activeProfile.targetDailyCharacters} 字。`,
        evidence: ['仅统计 manual_edit', `${today.effectiveSeconds} 秒有效输入时间`],
      });
    }
  }
  return RhythmDashboardSchema.parse({
    projectId,
    profile: activeProfile,
    today,
    cumulativeManualNetCharacters: days.reduce((total, day) => total + day.manualNetCharacters, 0),
    cumulativeEffectiveSeconds: days.reduce((total, day) => total + day.effectiveSeconds, 0),
    days,
    chapters,
    suggestions,
    calculatedAt: now.toISOString(),
  });
}

export class RhythmService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;

  constructor(
    workspace: ProjectWorkspaceService,
    options: { readonly clock?: DatabaseClock } = {},
  ) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
  }

  get(_requestId: string, projectId: string): Promise<RhythmDashboard> {
    return Promise.resolve(
      this.#workspace.readProject(projectId, (database) =>
        dashboard(database, projectId, this.#clock.now()),
      ),
    );
  }

  run(requestId: string, projectId: string): Promise<RhythmDashboard> {
    return this.#workspace.writeProject(requestId, projectId, (database) => {
      const now = this.#clock.now();
      ensureRhythmProfile(database, projectId, now.toISOString());
      return dashboard(database, projectId, now);
    });
  }

  updateProfile(requestId: string, raw: RhythmProfileUpdateInput): Promise<RhythmDashboard> {
    const input = RhythmProfileUpdateInputSchema.parse(raw);
    if (input.authority !== 'author') {
      throw new RhythmServiceError(
        'RHYTHM_AUTHOR_REQUIRED',
        'Only the author may update rhythm guidance.',
      );
    }
    dayKey(this.#clock.now(), input.timeZone);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const now = this.#clock.now();
      ensureRhythmProfile(database, input.projectId, now.toISOString());
      database
        .prepare(
          `UPDATE genre_rhythm_profiles
              SET enabled = ?, excitement_min_per_1000 = ?,
                  excitement_max_per_1000 = ?, hook_enabled = ?,
                  golden_three_enabled = ?, target_daily_characters = ?,
                  idle_threshold_seconds = ?, time_zone = ?, updated_at = ?
            WHERE project_id = ?`,
        )
        .run(
          input.enabled ? 1 : 0,
          input.excitementMinPer1000,
          input.excitementMaxPer1000,
          input.hookEnabled ? 1 : 0,
          input.goldenThreeEnabled ? 1 : 0,
          input.targetDailyCharacters,
          input.idleThresholdSeconds,
          input.timeZone,
          now.toISOString(),
          input.projectId,
        );
      return dashboard(database, input.projectId, now);
    });
  }
}
