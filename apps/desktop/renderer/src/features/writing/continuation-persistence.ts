/**
 * Continuation persistence bookkeeping for the writing workbench.
 *
 * The workbench persists ProjectContinuation snapshots through a debounced
 * canonical save and through a lightweight panel-switch save. Both paths must
 * treat the tracker as confirmed state only after Core acknowledges the
 * write: committing earlier suppresses legitimate re-submissions, because the
 * dedupe signature would then claim Core already holds state it never
 * received (M4-04 known risk #6, C8 workbench state coordination).
 */

export class ContinuationPersistenceTracker<Input> {
  #committedInput: Input | null = null;
  #committedSignature: string | null = null;

  /** The last input Core confirmed as persisted, if any. */
  committedInput(): Input | null {
    return this.#committedInput;
  }

  /** Whether persisting `next` can be skipped because Core already holds it. */
  isCommitted(next: Input): boolean {
    return this.#committedSignature === signatureOf(next);
  }

  /**
   * Records `input` as persisted. Must only be called after a successful
   * save; a failed or superseded save must leave the tracker untouched so the
   * same state stays eligible for re-submission.
   */
  commit(input: Input): void {
    this.#committedInput = input;
    this.#committedSignature = signatureOf(input);
  }
}

/**
 * Derives the lightweight panel-switch save from the last committed input.
 * Returns null when nothing is committed yet or the panel is unchanged, so
 * callers never issue redundant or fabricated writes.
 */
export function derivePanelSwitchInput<Input extends { readonly panel: Panel }, Panel>(
  committed: Input | null,
  panel: Panel,
): Input | null {
  if (!committed || committed.panel === panel) return null;
  return { ...committed, panel };
}

function signatureOf(input: unknown): string {
  return JSON.stringify(input);
}
