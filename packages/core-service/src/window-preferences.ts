import { WindowPreferencesSchema, type WindowPreferences } from '@worldforge/contracts';

import type { AppDatabase, DatabaseClock } from './database/index.js';

const systemClock: DatabaseClock = { now: () => new Date() };

function numeric(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

export class WindowPreferencesRepository {
  readonly #database: AppDatabase;
  readonly #clock: DatabaseClock;

  constructor(database: AppDatabase, clock: DatabaseClock = systemClock) {
    this.#database = database;
    this.#clock = clock;
  }

  get(): WindowPreferences | null {
    return this.#database.read((connection) => {
      const row = connection
        .prepare(
          `SELECT display_id, bounds_x_dip, bounds_y_dip, bounds_width_dip,
                  bounds_height_dip, scale_factor, maximized, workspace_alignment,
                  ui_scale_percent, body_font_size, content_width
             FROM window_preferences
            WHERE singleton_id = 1`,
        )
        .get();
      if (!row) return null;
      return WindowPreferencesSchema.parse({
        displayId: row.display_id,
        boundsDip: {
          x: numeric(row.bounds_x_dip),
          y: numeric(row.bounds_y_dip),
          width: numeric(row.bounds_width_dip),
          height: numeric(row.bounds_height_dip),
        },
        scaleFactor: numeric(row.scale_factor),
        maximized: numeric(row.maximized) === 1,
        workspaceAlignment: row.workspace_alignment,
        uiScalePercent: numeric(row.ui_scale_percent),
        bodyFontSize: numeric(row.body_font_size),
        contentWidth: row.content_width,
      });
    });
  }

  async save(requestId: string, input: WindowPreferences): Promise<WindowPreferences> {
    const preferences = WindowPreferencesSchema.parse(input);
    const result = await this.#database.write(requestId, (connection) => {
      connection
        .prepare(
          `INSERT INTO window_preferences(
             singleton_id, display_id, bounds_x_dip, bounds_y_dip, bounds_width_dip,
             bounds_height_dip, scale_factor, maximized, workspace_alignment,
             ui_scale_percent, body_font_size, content_width, updated_at
           ) VALUES(1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(singleton_id) DO UPDATE SET
             display_id = excluded.display_id,
             bounds_x_dip = excluded.bounds_x_dip,
             bounds_y_dip = excluded.bounds_y_dip,
             bounds_width_dip = excluded.bounds_width_dip,
             bounds_height_dip = excluded.bounds_height_dip,
             scale_factor = excluded.scale_factor,
             maximized = excluded.maximized,
             workspace_alignment = excluded.workspace_alignment,
             ui_scale_percent = excluded.ui_scale_percent,
             body_font_size = excluded.body_font_size,
             content_width = excluded.content_width,
             updated_at = excluded.updated_at`,
        )
        .run(
          preferences.displayId,
          preferences.boundsDip.x,
          preferences.boundsDip.y,
          preferences.boundsDip.width,
          preferences.boundsDip.height,
          preferences.scaleFactor,
          preferences.maximized ? 1 : 0,
          preferences.workspaceAlignment,
          preferences.uiScalePercent,
          preferences.bodyFontSize,
          preferences.contentWidth,
          this.#clock.now().toISOString(),
        );
      return preferences;
    });
    return result.value;
  }
}
