import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Readonly<Record<string, unknown>>;

const ALLOWED_FIELDS = new Set([
  'requestId',
  'taskId',
  'runId',
  'projectId',
  'providerId',
  'model',
  'protocol',
  'durationMs',
  'retryCount',
  'tokenCount',
  'characterCount',
  'operation',
  'rowCount',
  'errorCode',
  'retryable',
  'diagnosticId',
  'processStatus',
  'exitCode',
  'restartCount',
]);

function isSafeScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function sanitizeLogFields(
  fields: LogFields,
): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key) || !isSafeScalar(value)) continue;
    sanitized[key] = typeof value === 'string' ? value.slice(0, 256) : value;
  }
  return sanitized;
}

export function createDiagnosticId(): string {
  return `diag_${randomUUID()}`;
}

export class PrivacyLogger {
  readonly #directory: string;
  readonly #component: string;

  constructor(directory: string, component: string) {
    this.#directory = directory;
    this.#component = component;
  }

  async log(level: LogLevel, event: string, fields: LogFields = {}): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const timestamp = new Date().toISOString();
    const day = timestamp.slice(0, 10);
    const record = {
      timestamp,
      level,
      component: this.#component,
      event: event.slice(0, 128),
      ...sanitizeLogFields(fields),
    };
    await appendFile(
      path.join(this.#directory, `app-${day}.jsonl`),
      `${JSON.stringify(record)}\n`,
      {
        encoding: 'utf8',
        mode: 0o600,
      },
    );
  }
}
