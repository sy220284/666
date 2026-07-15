import { DatabaseFoundationError } from './types.js';

export class SerializedWriteQueue {
  #tail: Promise<void> = Promise.resolve();
  #accepting = true;
  #pending = 0;

  get accepting(): boolean {
    return this.#accepting;
  }

  get pending(): number {
    return this.#pending;
  }

  enqueue<T>(operation: () => T): Promise<T> {
    if (!this.#accepting) {
      return Promise.reject(
        new DatabaseFoundationError('WRITE_QUEUE_CLOSED', 'The database write queue is closed.'),
      );
    }

    this.#pending += 1;
    const result = this.#tail.then(operation);
    this.#tail = result.then(
      () => {
        this.#pending -= 1;
      },
      () => {
        this.#pending -= 1;
      },
    );
    return result;
  }

  async drain(): Promise<void> {
    await this.#tail;
  }

  async close(): Promise<void> {
    this.#accepting = false;
    await this.drain();
  }
}
