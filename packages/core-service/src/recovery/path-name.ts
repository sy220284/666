import { createHash } from 'node:crypto';

export const SAFE_PATH_COMPONENT_BYTES = 200;
export const SAFE_TEMPORARY_COMPONENT_BYTES = 250;

function isWindowsDeviceName(value: string): boolean {
  const stem = value.split('.', 1)[0]?.toLowerCase() ?? '';
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(stem);
}

function sanitize(value: string): string {
  const forbidden = new Set(['<', '>', ':', '"', '/', String.fromCharCode(92), '|', '?', '*']);
  const normalized = Array.from(value.normalize('NFC').trim(), (character) =>
    (character.codePointAt(0) ?? 0) < 32 || forbidden.has(character) ? '-' : character,
  )
    .join('')
    .replace(/[. ]+$/u, '');
  if (!normalized) return 'WorldForge';
  return isWindowsDeviceName(normalized) ? `WorldForge-${normalized}` : normalized;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function truncateUtf8(value: string, maximumBytes: number): string {
  let result = '';
  for (const character of value) {
    if (utf8Bytes(result) + utf8Bytes(character) > maximumBytes) break;
    result += character;
  }
  return result.replace(/[. ]+$/u, '');
}

function suffixHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}

export function safePathComponent(value: string, maximumBytes = SAFE_PATH_COMPONENT_BYTES): string {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 24) {
    throw new Error('PATH_COMPONENT_BUDGET_INVALID');
  }
  const cleaned = sanitize(value);
  if (utf8Bytes(cleaned) <= maximumBytes) return cleaned;
  const suffix = `-${suffixHash(cleaned)}`;
  const prefix = truncateUtf8(cleaned, maximumBytes - utf8Bytes(suffix));
  return `${prefix || 'WorldForge'}${suffix}`;
}

export function safeFileName(
  value: string,
  extension: string,
  maximumBytes = SAFE_PATH_COMPONENT_BYTES,
): string {
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
  const baseBudget = maximumBytes - utf8Bytes(normalizedExtension);
  if (baseBudget < 24) throw new Error('FILE_NAME_BUDGET_INVALID');
  return `${safePathComponent(value, baseBudget)}${normalizedExtension}`;
}

export function safeTemporaryName(finalName: string, suffix: string): string {
  const cleanedSuffix = sanitize(suffix);
  const suffixBytes = utf8Bytes(cleanedSuffix);
  const finalBudget = SAFE_TEMPORARY_COMPONENT_BYTES - suffixBytes;
  if (finalBudget < 24) throw new Error('TEMPORARY_NAME_SUFFIX_TOO_LONG');
  return `${safePathComponent(finalName, finalBudget)}${cleanedSuffix}`;
}
