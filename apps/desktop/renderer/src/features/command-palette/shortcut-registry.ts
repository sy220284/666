import type { ShortcutOverride } from '@worldforge/contracts';

import {
  COMMAND_CATALOG,
  commandCatalogEntry,
  shortcutForCommand,
  type CommandCatalogEntry,
} from './command-catalog.js';

export interface ShortcutContext {
  readonly projectAvailable: boolean;
  readonly readOnly: boolean;
}

export function normalizeShortcutEvent(event: KeyboardEvent, platform: string): string | null {
  if (event.isComposing || event.key === 'Process' || isModifierKey(event.key)) return null;
  const key = normalizedKey(event.key);
  if (!key) return null;
  const mac = /mac|darwin|iphone|ipad/iu.test(platform);
  const parts: string[] = [];
  const modPressed = mac ? event.metaKey : event.ctrlKey;
  if (modPressed) parts.push('Mod');
  if (event.ctrlKey && (mac || !modPressed)) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (parts.length === 0 && key.length === 1) return null;
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join('+');
}

export function commandForShortcut(
  event: KeyboardEvent,
  platform: string,
  overrides: readonly ShortcutOverride[],
  context: ShortcutContext,
): CommandCatalogEntry | null {
  const chord = normalizeShortcutEvent(event, platform);
  if (!chord || isDialogOwnedTarget(event.target)) return null;
  const editable = isEditableTarget(event.target);
  for (const entry of COMMAND_CATALOG) {
    if (shortcutForCommand(entry, overrides) !== chord) continue;
    if (entry.requiresProject && !context.projectAvailable) return null;
    if (!entry.allowReadOnly && context.readOnly) return null;
    if (editable && !entry.allowInEditable) return null;
    return entry;
  }
  return null;
}

export interface ShortcutConflict {
  readonly id: string;
  readonly label: string;
}

const EDITOR_RESERVED_SHORTCUTS: Readonly<Record<string, ShortcutConflict>> = {
  'Mod+S': { id: 'editor.save', label: '正文保存' },
  'Mod+Z': { id: 'editor.undo', label: '正文撤销' },
  'Mod+Shift+Z': { id: 'editor.redo', label: '正文重做' },
  'Mod+F': { id: 'editor.find', label: '当前章查找' },
  'Mod+Shift+F': { id: 'editor.focusMode', label: '沉浸写作' },
  'Mod+Enter': { id: 'editor.quickRewrite', label: '快速改写' },
  'Mod+Shift+L': { id: 'editor.blockLock', label: '锁定段落' },
};

export function shortcutConflict(
  commandId: string,
  shortcut: string,
  overrides: readonly ShortcutOverride[],
): ShortcutConflict | null {
  const commandConflict = COMMAND_CATALOG.find(
    (entry) => entry.id !== commandId && shortcutForCommand(entry, overrides) === shortcut,
  );
  if (commandConflict) return commandConflict;
  return EDITOR_RESERVED_SHORTCUTS[shortcut] ?? null;
}

export function updateShortcutOverride(
  overrides: readonly ShortcutOverride[],
  commandId: string,
  shortcut: string | null,
): readonly ShortcutOverride[] {
  const entry = commandCatalogEntry(commandId);
  if (!entry?.rebindable) return overrides;
  const next = overrides.filter((item) => item.commandId !== commandId);
  return [...next, { commandId, shortcut }];
}

export function removeShortcutOverride(
  overrides: readonly ShortcutOverride[],
  commandId: string,
): readonly ShortcutOverride[] {
  return overrides.filter((item) => item.commandId !== commandId);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
  );
}

function isDialogOwnedTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('[role="dialog"], [aria-modal="true"]'));
}

function isModifierKey(key: string): boolean {
  return ['Alt', 'Control', 'Meta', 'Shift'].includes(key);
}

function normalizedKey(key: string): string | null {
  if (key.length === 1) {
    const aliases: Record<string, string> = {
      ',': 'Comma',
      '.': 'Period',
      '/': 'Slash',
      ';': 'Semicolon',
      "'": 'Quote',
      '[': 'BracketLeft',
      ']': 'BracketRight',
      '\\': 'Backslash',
      '-': 'Minus',
      '=': 'Equal',
      '`': 'Backquote',
    };
    return aliases[key] ?? key;
  }
  if (/^F(?:[1-9]|1[0-2])$/u.test(key)) return key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab'].includes(key)) {
    return key;
  }
  return null;
}
