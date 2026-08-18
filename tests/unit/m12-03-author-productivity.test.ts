import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

import { AppSettingsSchema } from '@worldforge/contracts';
import {
  COMMAND_CATALOG,
  commandCatalogEntry,
  shortcutForCommand,
} from '../../apps/desktop/renderer/src/features/command-palette/command-catalog.js';
import {
  normalizeShortcutEvent,
  removeShortcutOverride,
  shortcutConflict,
  updateShortcutOverride,
} from '../../apps/desktop/renderer/src/features/command-palette/shortcut-registry.js';
import { ReviewDiffPanel } from '../../apps/desktop/renderer/src/features/writing/review-diff-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { renderToStaticMarkup } = rendererRequire('react-dom/server') as {
  readonly renderToStaticMarkup: typeof renderReactToStaticMarkup;
};

describe('M12-03 author productivity and personalization', () => {
  it('keeps one command identity source for palette, shortcuts and author actions', () => {
    expect(new Set(COMMAND_CATALOG.map((entry) => entry.id)).size).toBe(COMMAND_CATALOG.length);
    const palette = commandCatalogEntry('system.commandPalette');
    expect(palette).toMatchObject({
      handlerIdentity: 'system.commandPalette',
      defaultShortcut: 'Mod+K',
      allowInEditable: true,
      rebindable: true,
    });
    expect(commandCatalogEntry('system.typewriterMode')).toMatchObject({
      scope: 'writing',
      showInPalette: true,
    });
    expect(
      COMMAND_CATALOG.filter((entry) => entry.kind === 'generation').every(
        (entry) => !entry.allowReadOnly,
      ),
    ).toBe(true);
  });

  it('normalizes platform shortcuts, blocks IME composition and detects conflicts', () => {
    expect(
      normalizeShortcutEvent(
        contractInput<KeyboardEvent>({
          key: 'k',
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          isComposing: false,
        }),
        'Win32',
      ),
    ).toBe('Mod+K');
    expect(
      normalizeShortcutEvent(
        contractInput<KeyboardEvent>({
          key: 'k',
          ctrlKey: false,
          metaKey: true,
          altKey: false,
          shiftKey: false,
          isComposing: false,
        }),
        'MacIntel',
      ),
    ).toBe('Mod+K');
    expect(
      normalizeShortcutEvent(
        contractInput<KeyboardEvent>({
          key: 'Process',
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          isComposing: true,
        }),
        'Win32',
      ),
    ).toBeNull();
    expect(
      normalizeShortcutEvent(
        contractInput<KeyboardEvent>({
          key: 'K',
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: true,
          isComposing: false,
        }),
        'Win32',
      ),
    ).toBe('Mod+Shift+K');

    const chapter = commandCatalogEntry('generation.chapter')!;
    const withOverride = updateShortcutOverride([], chapter.id, 'Mod+K');
    expect(shortcutForCommand(chapter, withOverride)).toBe('Mod+K');
    expect(shortcutConflict(chapter.id, 'Mod+K', [])?.id).toBe('system.commandPalette');
    expect(removeShortcutOverride(withOverride, chapter.id)).toEqual([]);
    expect(updateShortcutOverride([], 'system.notRegistered', 'Mod+P')).toEqual([]);
  });

  it('accepts persisted typewriter, Theme B and safe seal settings while rejecting unsafe seal text', () => {
    const settings = AppSettingsSchema.parse({
      schemaVersion: 1,
      language: 'zh-CN',
      startupBehavior: 'show-home',
      defaultMode: 'professional',
      themeId: 'theme-b',
      themeVariant: 'high-contrast',
      reduceMotion: false,
      typewriterMode: true,
      typewriterAnchorPercent: 52,
      themeSealText: '落笔生花',
      shortcutOverrides: [{ commandId: 'system.commandPalette', shortcut: 'Mod+P' }],
    });
    expect(settings).toMatchObject({
      themeVariant: 'high-contrast',
      typewriterMode: true,
      typewriterAnchorPercent: 52,
      themeSealText: '落笔生花',
    });
    expect(AppSettingsSchema.safeParse({ ...settings, themeSealText: '<img src=x>' }).success).toBe(
      false,
    );
  });

  it('renders a three-column review only when a real base is available', () => {
    const threeWay = renderToStaticMarkup(
      createElement(ReviewDiffPanel, {
        baseTitle: '基础版本',
        baseText: '第一段\n第二段',
        currentTitle: '当前稿',
        currentText: '第一段\n当前第二段',
        comparisonTitle: '建议稿',
        comparisonText: '第一段\n建议第二段',
        marker: 'candidate',
      }),
    );
    expect(threeWay).toContain('data-review-three-way');
    expect(threeWay).toContain('基础版本');
    expect(threeWay).toContain('当前稿');
    expect(threeWay).toContain('建议稿');

    const fallback = renderToStaticMarkup(
      createElement(ReviewDiffPanel, {
        currentTitle: '当前稿',
        currentText: '当前正文',
        comparisonTitle: '建议稿',
        comparisonText: '建议正文',
        marker: 'candidate',
      }),
    );
    expect(fallback).not.toContain('data-review-three-way');
    expect(fallback).toContain('review-diff__headings');
  });

  it('reports the exact formatter drift for the M12 checks workbench', async () => {
    const sourceUrl = new URL(
      '../../apps/desktop/renderer/src/features/checks/checks-workbench.tsx',
      import.meta.url,
    );
    const source = await readFile(sourceUrl, 'utf8');
    const formatted = await format(source, {
      parser: 'typescript',
      printWidth: 100,
      singleQuote: true,
      trailingComma: 'all',
    });
    if (source === formatted) return;

    let prefix = 0;
    while (prefix < source.length && source[prefix] === formatted[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < source.length - prefix &&
      suffix < formatted.length - prefix &&
      source[source.length - 1 - suffix] === formatted[formatted.length - 1 - suffix]
    ) {
      suffix += 1;
    }
    const current = source.slice(prefix, source.length - suffix).slice(0, 4000);
    const expected = formatted.slice(prefix, formatted.length - suffix).slice(0, 4000);
    throw new Error(
      `M12_FORMAT_DIAGNOSTIC prefix=${prefix} suffix=${suffix}\nCURRENT:\n${current}\nEXPECTED:\n${expected}`,
    );
  });
});
