import {
  AppSettingsSchema,
  AppSettingsUpdateSchema,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppSettingsSnapshot,
  type AppSettingsUpdate,
} from '@worldforge/contracts';

import type { AppDatabase, DatabaseClock } from './database/index.js';

const SETTINGS_KEY = 'application_preferences';
const systemClock: DatabaseClock = { now: () => new Date() };

function defaults(): AppSettings {
  return { ...DEFAULT_APP_SETTINGS };
}

function snapshotFromValueJson(valueJson: string | null): AppSettingsSnapshot {
  if (valueJson === null) return { source: 'default', settings: defaults() };

  let value: unknown;
  try {
    value = JSON.parse(valueJson);
  } catch {
    return {
      source: 'recovered',
      recoveryReason: 'invalid-json',
      settings: defaults(),
    };
  }
  if (
    value &&
    typeof value === 'object' &&
    'schemaVersion' in value &&
    value.schemaVersion !== 1
  ) {
    return {
      source: 'recovered',
      recoveryReason: 'unsupported-version',
      settings: defaults(),
    };
  }
  const parsed = AppSettingsSchema.safeParse(value);
  if (!parsed.success) {
    return {
      source: 'recovered',
      recoveryReason: 'invalid-value',
      settings: defaults(),
    };
  }
  return { source: 'stored', settings: parsed.data };
}

export class AppSettingsRepository {
  readonly #database: AppDatabase;
  readonly #clock: DatabaseClock;

  constructor(database: AppDatabase, clock: DatabaseClock = systemClock) {
    this.#database = database;
    this.#clock = clock;
  }

  get(): AppSettingsSnapshot {
    const valueJson = this.#database.read((database) => {
      const row = database
        .prepare('SELECT value_json FROM app_settings WHERE key = ?')
        .get(SETTINGS_KEY);
      return row ? String(row.value_json) : null;
    });
    return snapshotFromValueJson(valueJson);
  }

  async update(
    requestId: string,
    input: AppSettingsUpdate,
  ): Promise<AppSettingsSnapshot> {
    const update = AppSettingsUpdateSchema.parse(input);
    const result = await this.#database.write(requestId, (database) => {
      const row = database
        .prepare('SELECT value_json FROM app_settings WHERE key = ?')
        .get(SETTINGS_KEY);
      const current = snapshotFromValueJson(row ? String(row.value_json) : null).settings;
      const settings = AppSettingsSchema.parse({ ...current, ...update });
      database
        .prepare(
          `INSERT INTO app_settings(key, value_json, updated_at) VALUES(?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value_json = excluded.value_json,
             updated_at = excluded.updated_at`,
        )
        .run(SETTINGS_KEY, JSON.stringify(settings), this.#clock.now().toISOString());
      return settings;
    });
    return { source: 'stored', settings: result.value };
  }

  async reset(requestId: string): Promise<AppSettingsSnapshot> {
    await this.#database.write(requestId, (database) => {
      database.prepare('DELETE FROM app_settings WHERE key = ?').run(SETTINGS_KEY);
    });
    return { source: 'default', settings: defaults() };
  }
}
