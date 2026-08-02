import type { ReactNode } from 'react';

export function LedgerSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <h3>{title}</h3>
      <div className="ledger-list">{children}</div>
    </section>
  );
}

export function LedgerRecord({
  title,
  lines,
}: {
  readonly title: string;
  readonly lines: readonly string[];
}) {
  return (
    <article className="ledger-record">
      <h4>{title}</h4>
      {lines.filter(Boolean).map((line, index) => (
        <p key={`${line}-${index}`}>{line}</p>
      ))}
    </article>
  );
}

export function lineValues(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function nullableString(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}
