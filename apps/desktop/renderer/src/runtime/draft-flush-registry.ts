export type DraftFlushHandler = () => Promise<boolean>;

export const DRAFT_FLUSH_FAILED_EVENT = 'worldforge:draft-flush-failed';

let activeHandler: DraftFlushHandler | null = null;

function publishFlushFailure(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DRAFT_FLUSH_FAILED_EVENT));
}

export function registerDraftFlushHandler(handler: DraftFlushHandler): () => void {
  activeHandler = handler;
  return () => {
    if (activeHandler === handler) activeHandler = null;
  };
}

export async function flushRegisteredDraft(): Promise<boolean> {
  try {
    const flushed = await (activeHandler?.() ?? Promise.resolve(true));
    if (!flushed) publishFlushFailure();
    return flushed;
  } catch {
    publishFlushFailure();
    return false;
  }
}
