import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

const databases: DatabaseSync[] = [];

function database(): DatabaseSync {
  const value = new DatabaseSync(':memory:', {
    allowExtension: false,
    enableForeignKeyConstraints: true,
    readBigInts: true,
  });
  databases.push(value);
  return value;
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('node:sqlite compatibility contract', () => {
  it('preserves the transaction state and rollback semantics used by the Core write boundary', () => {
    const db = database();
    db.exec('CREATE TABLE values_table(id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT;');

    expect(db.isTransaction).toBe(false);
    db.exec('BEGIN IMMEDIATE');
    expect(db.isTransaction).toBe(true);
    db.prepare('INSERT INTO values_table(value) VALUES(?)').run('temporary');
    db.exec('ROLLBACK');

    expect(db.isTransaction).toBe(false);
    expect(Number(db.prepare('SELECT count(*) AS count FROM values_table').get()?.count)).toBe(0);
  });

  it('keeps bigint reads, foreign keys and query_only behavior compatible with the database foundation', () => {
    const db = database();
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE parent(id INTEGER PRIMARY KEY) STRICT;
      CREATE TABLE child(
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES parent(id)
      ) STRICT;
      INSERT INTO parent(id) VALUES(9007199254740993);
    `);

    const parent = db.prepare('SELECT id FROM parent').get();
    expect(parent?.id).toBe(9007199254740993n);
    expect(() => db.prepare('INSERT INTO child(id, parent_id) VALUES(1, 99)').run()).toThrow();

    db.exec('PRAGMA query_only = ON;');
    expect(() => db.prepare('INSERT INTO parent(id) VALUES(2)').run()).toThrow();
    expect(db.prepare('SELECT count(*) AS count FROM parent').get()).toMatchObject({ count: 1n });
  });

  it('keeps the FTS5 trigram capability required by search and project open', () => {
    const db = database();
    const enabled = db.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled").get();
    expect(Number(enabled?.enabled)).toBe(1);

    db.exec("CREATE VIRTUAL TABLE trigram_probe USING fts5(value, tokenize='trigram');");
    db.prepare('INSERT INTO trigram_probe(value) VALUES(?)').run('汴京夜雨');
    const matches = db
      .prepare("SELECT value FROM trigram_probe WHERE trigram_probe MATCH '京夜'")
      .all();
    expect(matches).toEqual([{ value: '汴京夜雨' }]);
  });
});
