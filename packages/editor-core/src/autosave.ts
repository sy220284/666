declare function setTimeout(handler: () => void, timeout: number): unknown;
declare function clearTimeout(handle: unknown): void;

export type AutosaveState = 'idle' | 'waiting' | 'paused' | 'saving' | 'saved' | 'failed';

export interface DraftAutosaveOptions {
  readonly delayMs: number;
  readonly save: () => Promise<boolean>;
  readonly onState?: (state: AutosaveState) => void;
}

export class DraftAutosaveCoordinator {
  readonly #delayMs: number;
  readonly #save: () => Promise<boolean>;
  readonly #onState: ((state: AutosaveState) => void) | undefined;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #inFlight: Promise<boolean> | null = null;
  #dirty = false;
  #paused = false;
  #destroyed = false;

  constructor(options: DraftAutosaveOptions) {
    if (!Number.isInteger(options.delayMs) || options.delayMs < 0) {
      throw new Error('AUTOSAVE_DELAY_INVALID');
    }
    this.#delayMs = options.delayMs;
    this.#save = options.save;
    this.#onState = options.onState;
  }

  get hasPendingWork(): boolean {
    return this.#dirty || this.#inFlight !== null;
  }

  markDirty(): void {
    if (this.#destroyed) return;
    this.#dirty = true;
    if (!this.#paused && !this.#inFlight) this.#schedule();
  }

  pause(): void {
    if (this.#destroyed) return;
    this.#paused = true;
    this.#clearTimer();
    this.#emit('paused');
  }

  resume(): void {
    if (this.#destroyed) return;
    this.#paused = false;
    if (this.#dirty && !this.#inFlight) this.#schedule();
    else this.#emit('idle');
  }

  async flush(): Promise<boolean> {
    if (this.#destroyed) return true;
    this.#clearTimer();
    if (this.#paused) return false;
    if (this.#inFlight) {
      const completed = await this.#inFlight;
      if (!completed) return false;
      if (this.#dirty) return this.flush();
      return true;
    }
    if (!this.#dirty) return true;

    this.#dirty = false;
    this.#emit('saving');
    const operation = this.#save().catch(() => false);
    this.#inFlight = operation;
    const completed = await operation;
    if (this.#inFlight === operation) this.#inFlight = null;
    if (!completed) {
      this.#dirty = true;
      this.#emit('failed');
      return false;
    }
    this.#emit('saved');
    if (this.#dirty) return this.flush();
    return true;
  }

  destroy(): void {
    this.#destroyed = true;
    this.#clearTimer();
    this.#onState?.('idle');
  }

  #schedule(): void {
    this.#clearTimer();
    this.#emit('waiting');
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.flush();
    }, this.#delayMs);
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #emit(state: AutosaveState): void {
    this.#onState?.(state);
  }
}
