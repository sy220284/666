export const ENTITY_TYPES = [
  'character',
  'location',
  'faction',
  'item',
  'ability',
  'rule',
  'event',
  'custom',
] as const;

export const ENTITY_STATUSES = ['active', 'archived'] as const;
export const CANON_FACT_STATUSES = ['current', 'historical'] as const;
export const CANON_AUTHORITIES = ['author', 'ai'] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
export type EntityStatus = (typeof ENTITY_STATUSES)[number];
export type CanonFactStatus = (typeof CANON_FACT_STATUSES)[number];
export type CanonAuthority = (typeof CANON_AUTHORITIES)[number];

function normalizedText(value: string): string {
  return value.normalize('NFKC').trim();
}

export function normalizeEntityName(value: string): string {
  const normalized = normalizedText(value);
  if (normalized.length < 1 || normalized.length > 240) {
    throw new Error('ENTITY_NAME_INVALID');
  }
  return normalized;
}

export function normalizeEntityAliases(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const value of values) {
    const alias = normalizedText(value);
    if (!alias) continue;
    if (alias.length > 240) throw new Error('ENTITY_ALIAS_INVALID');
    const key = alias.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}

export function normalizeFactKey(value: string): string {
  const normalized = normalizedText(value).toLocaleLowerCase('en-US').replace(/\s+/gu, '-');
  if (
    normalized.length < 1 ||
    normalized.length > 120 ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new Error('CANON_FACT_KEY_INVALID');
  }
  return normalized;
}

export function assertAuthorAuthority(authority: CanonAuthority): void {
  if (authority !== 'author') throw new Error('CANON_AUTHOR_REQUIRED');
}
