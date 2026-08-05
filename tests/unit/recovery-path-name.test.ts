import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import {
  SAFE_PATH_COMPONENT_BYTES,
  SAFE_TEMPORARY_COMPONENT_BYTES,
  safeFileName,
  safePathComponent,
  safeTemporaryName,
} from '../../packages/core-service/src/recovery/path-name.js';

describe('M10-11 recovery path component budget', () => {
  it('truncates long Chinese names by UTF-8 bytes and adds a stable collision suffix', () => {
    const source = '超长中文标题'.repeat(80);
    const first = safePathComponent(source);
    const second = safePathComponent(source);

    expect(first).toBe(second);
    expect(Buffer.byteLength(first, 'utf8')).toBeLessThanOrEqual(SAFE_PATH_COMPONENT_BYTES);
    expect(first).toMatch(/-[a-f0-9]{10}$/u);
  });

  it('preserves the final extension while budgeting the complete export name', () => {
    const fileName = safeFileName(`${'章节'.repeat(100)}-${'版本'.repeat(100)}`, '.txt');

    expect(fileName.endsWith('.txt')).toBe(true);
    expect(Buffer.byteLength(fileName, 'utf8')).toBeLessThanOrEqual(SAFE_PATH_COMPONENT_BYTES);
  });

  it('keeps temporary siblings below the conservative filesystem component limit', () => {
    const finalName = safeFileName('正文'.repeat(100), '.txt');
    const temporary = safeTemporaryName(
      finalName,
      '.partial-550e8400-e29b-41d4-a716-446655440000',
    );

    expect(Buffer.byteLength(temporary, 'utf8')).toBeLessThanOrEqual(
      SAFE_TEMPORARY_COMPONENT_BYTES,
    );
  });
});
