import {
  ProviderConfigInputSchema,
  ProviderConfigIdSchema,
  ProviderConfigSchema,
  type ProviderConfig,
  type ProviderConfigInput,
} from '@worldforge/contracts';

import type { AppDatabase, DatabaseClock } from './database/index.js';

const systemClock: DatabaseClock = { now: () => new Date() };

function numeric(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

function rowToProviderConfig(row: Record<string, unknown>): ProviderConfig {
  return ProviderConfigSchema.parse({
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    baseUrl: row.base_url,
    model: row.model,
    credentialRef: row.credential_ref,
    timeoutMs: numeric(row.timeout_ms),
    options: JSON.parse(String(row.options_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class ProviderConfigsRepository {
  readonly #database: AppDatabase;
  readonly #clock: DatabaseClock;

  constructor(database: AppDatabase, clock: DatabaseClock = systemClock) {
    this.#database = database;
    this.#clock = clock;
  }

  list(): readonly ProviderConfig[] {
    return this.#database.read((database) =>
      database
        .prepare('SELECT * FROM provider_configs ORDER BY name COLLATE NOCASE ASC, id ASC')
        .all()
        .map(rowToProviderConfig),
    );
  }

  get(id: string): ProviderConfig | null {
    const providerId = ProviderConfigIdSchema.parse(id);
    return this.#database.read((database) => {
      const row = database.prepare('SELECT * FROM provider_configs WHERE id = ?').get(providerId);
      return row ? rowToProviderConfig(row) : null;
    });
  }

  async upsert(requestId: string, input: ProviderConfigInput): Promise<ProviderConfig> {
    const config = ProviderConfigInputSchema.parse(input);
    const updatedAt = this.#clock.now().toISOString();
    const result = await this.#database.write(requestId, (database) => {
      const existing = database
        .prepare('SELECT created_at FROM provider_configs WHERE id = ?')
        .get(config.id);
      const createdAt = existing ? String(existing.created_at) : updatedAt;
      database
        .prepare(
          `INSERT INTO provider_configs(
             id, name, protocol, base_url, model, credential_ref, timeout_ms,
             options_json, created_at, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             protocol = excluded.protocol,
             base_url = excluded.base_url,
             model = excluded.model,
             credential_ref = excluded.credential_ref,
             timeout_ms = excluded.timeout_ms,
             options_json = excluded.options_json,
             updated_at = excluded.updated_at`,
        )
        .run(
          config.id,
          config.name,
          config.protocol,
          config.baseUrl,
          config.model,
          config.credentialRef,
          config.timeoutMs,
          JSON.stringify(config.options),
          createdAt,
          updatedAt,
        );
      return ProviderConfigSchema.parse({ ...config, createdAt, updatedAt });
    });
    return result.value;
  }

  async remove(requestId: string, id: string): Promise<boolean> {
    const providerId = ProviderConfigIdSchema.parse(id);
    const result = await this.#database.write(requestId, (database) => {
      const removed = database.prepare('DELETE FROM provider_configs WHERE id = ?').run(providerId);
      return Number(removed.changes) > 0;
    });
    return result.value;
  }
}
