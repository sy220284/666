export type DraftFlushHandler = () => Promise<boolean>;

let activeHandler: DraftFlushHandler | null = null;

export function registerDraftFlushHandler(handler: DraftFlushHandler): () => void {
  activeHandler = handler;
  return () => {
    if (activeHandler === handler) activeHandler = null;
  };
}

export function flushRegisteredDraft(): Promise<boolean> {
  return activeHandler?.() ?? Promise.resolve(true);
}
