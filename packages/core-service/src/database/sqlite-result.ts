type SqliteRow = Readonly<Record<string, unknown>>;

function isSqliteRow(value: unknown): value is SqliteRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Centralizes the unavoidable `node:sqlite` unknown result boundary.
 *
 * StatementSync intentionally returns `unknown`/`unknown[]`. Query modules still own the
 * query-specific row type, while this boundary rejects impossible primitive/array shapes before
 * those rows enter domain mapping code. `undefined` is accepted for StatementSync.get() misses.
 */
export function sqliteResult<T>(value: unknown, context = 'SQLite query'): T {
  if (value === undefined) return value as T;
  if (Array.isArray(value)) {
    if (value.some((row) => !isSqliteRow(row))) {
      throw new TypeError(`${context} returned a non-row array entry`);
    }
    return value as T;
  }
  if (!isSqliteRow(value)) throw new TypeError(`${context} returned a non-row value`);
  return value as T;
}
