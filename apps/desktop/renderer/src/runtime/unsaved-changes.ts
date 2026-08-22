import { useCallback, useEffect, useRef, useState } from 'react';

import { authorConfirm } from './author-dialog.js';

interface UnsavedChangeEntry {
  readonly label: string;
}

const registeredChanges = new Map<symbol, UnsavedChangeEntry>();

function distinctLabels(labels: readonly string[]): readonly string[] {
  return [...new Set(labels.filter(Boolean))];
}

function unsavedChangesMessage(labels: readonly string[], action: string): string | null {
  const visible = distinctLabels(labels);
  if (visible.length === 0) return null;
  const summary =
    visible.length <= 3 ? visible.join('、') : `${visible.slice(0, 3).join('、')}等内容`;
  return `${summary}有未保存修改。${action}会放弃这些修改，是否继续？`;
}

async function confirmDiscardLabels(labels: readonly string[], action: string): Promise<boolean> {
  const message = unsavedChangesMessage(labels, action);
  return message === null
    ? true
    : authorConfirm({
        title: '保留还是放弃未保存修改？',
        message,
        confirmLabel: '放弃修改并继续',
        cancelLabel: '继续编辑',
        danger: true,
      });
}

export function registeredUnsavedChangeLabels(): readonly string[] {
  return distinctLabels([...registeredChanges.values()].map((entry) => entry.label));
}

export function confirmRegisteredUnsavedChanges(action: string): Promise<boolean> {
  return confirmDiscardLabels(registeredUnsavedChangeLabels(), action);
}

export function confirmRegisteredUnsavedChangesForShutdown(action: string): boolean {
  const message = unsavedChangesMessage(registeredUnsavedChangeLabels(), action);
  if (message === null || typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }
  // Electron 的关闭准备握手必须同步裁决；仅此安全兜底保留原生确认框。
  return window.confirm(message);
}

export interface UnsavedChangesGuard {
  readonly dirty: boolean;
  readonly markDirty: () => void;
  readonly clearDirty: () => void;
  readonly confirmDiscard: (action: string) => Promise<boolean>;
}

export function useUnsavedChangesGuard(label: string): UnsavedChangesGuard {
  const token = useRef(Symbol(label));
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  const markDirty = useCallback((): void => {
    dirtyRef.current = true;
    registeredChanges.set(token.current, { label });
    setDirty(true);
  }, [label]);

  const clearDirty = useCallback((): void => {
    dirtyRef.current = false;
    registeredChanges.delete(token.current);
    setDirty(false);
  }, []);

  const confirmDiscard = useCallback(
    async (action: string): Promise<boolean> => {
      if (!dirtyRef.current) return true;
      if (!(await confirmDiscardLabels([label], action))) return false;
      clearDirty();
      return true;
    },
    [clearDirty, label],
  );

  useEffect(() => {
    const currentToken = token.current;
    if (dirtyRef.current) registeredChanges.set(currentToken, { label });
    return () => {
      registeredChanges.delete(currentToken);
    };
  }, [label]);

  return { dirty, markDirty, clearDirty, confirmDiscard };
}
