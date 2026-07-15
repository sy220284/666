import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('Electron Core SQLite runtime', () => {
  it('ships node:sqlite with FTS5 trigram support', async () => {
    const electronModule: unknown = createRequire(import.meta.url)('electron');
    expect(typeof electronModule).toBe('string');
    if (typeof electronModule !== 'string') return;

    const script = `
      const { DatabaseSync } = require('node:sqlite');
      const database = new DatabaseSync(':memory:');
      const fts5 = database.prepare(
        "SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled"
      ).get().enabled;
      database.exec(
        "CREATE VIRTUAL TABLE probe USING fts5(value, tokenize='trigram')"
      );
      console.log(JSON.stringify({
        electron: process.versions.electron,
        node: process.versions.node,
        sqlite: process.versions.sqlite,
        fts5
      }));
      database.close();
    `;
    const { stdout } = await execFileAsync(electronModule, ['-e', script], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: 10_000,
    });
    const result: unknown = JSON.parse(stdout.trim());

    expect(result).toMatchObject({
      electron: '43.1.1',
      fts5: 1,
    });
    expect(result).toHaveProperty('node');
    expect(result).toHaveProperty('sqlite');
  });
});
