type ResultEnvelope =
  | { readonly ok: true; readonly operation: string; readonly data: unknown }
  | {
      readonly ok: false;
      readonly operation: string;
      readonly errorCode: string;
      readonly details?: unknown;
    };

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('TEST_RESULT_ENVELOPE_OBJECT_REQUIRED');
  }
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const unexpected = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new TypeError(`TEST_RESULT_ENVELOPE_UNEXPECTED_KEYS:${unexpected.join(',')}`);
  }
}

export const strictResultEnvelopeSchema = {
  parse(input: unknown): ResultEnvelope {
    const record = objectRecord(input);
    if (typeof record.operation !== 'string' || record.operation.length === 0) {
      throw new TypeError('TEST_RESULT_ENVELOPE_OPERATION_REQUIRED');
    }
    if (record.ok === true) {
      exactKeys(record, ['ok', 'operation', 'data']);
      if (!Object.hasOwn(record, 'data')) {
        throw new TypeError('TEST_RESULT_ENVELOPE_DATA_REQUIRED');
      }
      return record as ResultEnvelope;
    }
    if (record.ok === false) {
      exactKeys(record, ['ok', 'operation', 'errorCode', 'details']);
      if (typeof record.errorCode !== 'string' || record.errorCode.length === 0) {
        throw new TypeError('TEST_RESULT_ENVELOPE_ERROR_CODE_REQUIRED');
      }
      return record as ResultEnvelope;
    }
    throw new TypeError('TEST_RESULT_ENVELOPE_OK_REQUIRED');
  },
};
