const NO_SCOPE = Symbol('continuation-no-scope');
const NO_PANEL = Symbol('continuation-no-panel');
const trackerByCommittedInput = new WeakMap<object, ContinuationPersistenceTracker<unknown>>();

/**
 * Continuation persistence bookkeeping for the writing workbench.
 *
 * The tracker distinguishes Core-confirmed state from the latest Renderer
 * intent. This prevents a delayed retry captured by an older panel render from
 * re-submitting obsolete state after the author has already moved elsewhere.
 */
export class ContinuationPersistenceTracker<Input> {
  #committedInput: Input | null = null;
  #committedSignature: string | null = null;
  #desiredSignature: string | null = null;
  #desiredScope: string | typeof NO_SCOPE = NO_SCOPE;
  #desiredPanel: unknown | typeof NO_PANEL = NO_PANEL;

  /** The last input Core confirmed as persisted, if any. */
  committedInput(): Input | null {
    this.#rememberOwner(this.#committedInput);
    return this.#committedInput;
  }

  /**
   * Whether persisting `next` can be skipped.
   *
   * A request is skipped when Core already holds the same state or when it was
   * captured by an older panel render in the same project/chapter/Draft scope
   * and has since been superseded by a newer panel intent.
   */
  isCommitted(next: Input): boolean {
    const scope = scopeOf(next);
    const panel = fieldOf(next, 'panel', NO_PANEL);
    const sameScope = this.#desiredScope === NO_SCOPE || scope === this.#desiredScope;

    if (
      sameScope &&
      this.#desiredPanel !== NO_PANEL &&
      panel !== NO_PANEL &&
      panel !== this.#desiredPanel
    ) {
      return true;
    }

    this.noteIntent(next);
    return this.#committedSignature === signatureOf(next);
  }

  /** Records the latest Renderer state that should eventually reach Core. */
  noteIntent(input: Input): void {
    this.#desiredSignature = signatureOf(input);
    this.#desiredScope = scopeOf(input);
    this.#desiredPanel = fieldOf(input, 'panel', NO_PANEL);
  }

  /** Whether `input` would replace a newer panel intent in the same scope. */
  hasDifferentPanelIntent(input: Input): boolean {
    const scope = scopeOf(input);
    const panel = fieldOf(input, 'panel', NO_PANEL);
    return (
      this.#desiredScope !== NO_SCOPE &&
      scope === this.#desiredScope &&
      this.#desiredPanel !== NO_PANEL &&
      panel !== NO_PANEL &&
      panel !== this.#desiredPanel
    );
  }

  /**
   * Records `input` as persisted only when it still represents the latest
   * Renderer intent. A superseded success must not move the confirmed cursor
   * backwards even if its underlying write completed normally.
   */
  commit(input: Input): void {
    const signature = signatureOf(input);
    if (this.#desiredSignature !== null && signature !== this.#desiredSignature) return;
    this.#committedInput = input;
    this.#committedSignature = signature;
    this.#rememberOwner(input);
  }

  #rememberOwner(input: Input | null): void {
    if (!input || typeof input !== 'object') return;
    trackerByCommittedInput.set(input, this as unknown as ContinuationPersistenceTracker<unknown>);
  }
}

/**
 * Derives a lightweight panel-switch state from the last Core-confirmed
 * snapshot and marks the selected panel as the newest Renderer intent before
 * any asynchronous save settles. Returning to the committed panel queues a
 * restoring write when another panel request can still overwrite Core.
 */
export function derivePanelSwitchInput<Input extends { readonly panel: Panel }, Panel>(
  committed: Input | null,
  panel: Panel,
): Input | null {
  if (!committed) return null;
  const tracker = trackerByCommittedInput.get(committed);
  if (committed.panel === panel) {
    const shouldRestore = tracker?.hasDifferentPanelIntent(committed) ?? false;
    tracker?.noteIntent(committed);
    return shouldRestore ? committed : null;
  }
  const next = { ...committed, panel };
  tracker?.noteIntent(next);
  return next;
}

function scopeOf(input: unknown): string | typeof NO_SCOPE {
  const values = ['projectId', 'chapterId', 'draftId'].map((field) =>
    fieldOf(input, field, NO_SCOPE),
  );
  if (values.every((value) => value === NO_SCOPE)) return NO_SCOPE;
  return values
    .map((value) => (value === NO_SCOPE ? '' : (JSON.stringify(value) ?? String(value))))
    .join('|');
}

function fieldOf<Fallback>(
  input: unknown,
  field: string,
  fallback: Fallback,
): unknown | Fallback {
  if (!input || typeof input !== 'object' || !(field in input)) return fallback;
  return (input as Record<string, unknown>)[field];
}

function signatureOf(input: unknown): string {
  return JSON.stringify(input) ?? String(input);
}
