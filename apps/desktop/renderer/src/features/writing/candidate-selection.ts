export function toggleSelectionSet(
  source: ReadonlySet<string>,
  value: string,
  included: boolean,
): Set<string> {
  const next = new Set(source);
  if (included) next.add(value);
  else next.delete(value);
  return next;
}

export function nullableFormText(value: FormDataEntryValue | null): string | null {
  const result = String(value ?? '').trim();
  return result || null;
}
