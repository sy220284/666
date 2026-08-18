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
  if (!chord) return null;
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

export function shortcutConflict(
  commandId: string,
  shortcut: string,
  overrides: readonly ShortcutOverride[],
): CommandCatalogEntry | null {
  return (
    COMMAND_CATALOG.find(
      (entry) => entry.id !== commandId && shortcutForCommand(entry, overrides) === shortcut,
    ) ?? null
  );
}

export function updateShortcutOverride(
  overrides: readonly ShortcutOverride[],
  commandId: string,
  shortcut: string | null,
): readonly ShortcutOverride[] {
  if (!commandCatalogEntry(commandId)) return overrides;
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
