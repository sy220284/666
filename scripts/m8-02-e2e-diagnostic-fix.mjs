import { readFile, writeFile } from 'node:fs/promises';

async function edit(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`NO_CHANGE:${path}`);
  await writeFile(path, after, 'utf8');
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`MISSING:${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`MULTIPLE:${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

await edit('tests/e2e/continuation-panel-race.spec.ts', (source) =>
  replaceOnce(
    source,
    `    await page.locator('[data-open-recent]').click();\n    await expect(page.locator('[data-draft-workspace]')).toBeVisible();`,
    `    await page.locator('[data-open-recent]').click();\n    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open', {\n      timeout: 20_000,\n    });\n    await expect(page.locator('[data-draft-workspace]')).toBeVisible({ timeout: 20_000 });`,
    'continuation-reopen-wait',
  ),
);

await edit('tests/e2e/electron-shell.spec.ts', (source) => {
  const marker = `test('records Renderer animation-frame budget during sustained writing scroll'`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('MISSING:renderer-fps-test');
  const tail = source.slice(start);
  const needle = `  } finally {\n    await closeGracefully(application);\n  }\n});`;
  const index = tail.lastIndexOf(needle);
  if (index < 0) throw new Error('MISSING:renderer-fps-close');
  const absolute = start + index;
  return (
    source.slice(0, absolute) +
    `  } finally {\n    await application.close();\n  }\n});` +
    source.slice(absolute + needle.length)
  );
});

const diagnostic = `    const recoveryDiagnostic = await page.evaluate(async () => {\n      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge }).worldforge;\n      const active = await bridge.project.getActive();\n      if (!active.ok || !active.data) return { active, overview: null };\n      const overview = await bridge.recovery.getOverview(active.data.projectId);\n      return { active, overview };\n    });\n    console.log('M8_RECOVERY_DIAGNOSTIC', JSON.stringify(recoveryDiagnostic));\n`;

await edit('tests/e2e/m1-deferred-acceptance.spec.ts', (source) =>
  replaceOnce(
    source,
    `    await page.locator('[data-open-recovery]').click();\n    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {\n      timeout: 20_000,\n    });`,
    `    await page.locator('[data-open-recovery]').click();\n${diagnostic}    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {\n      timeout: 20_000,\n    });`,
    'm1-recovery-diagnostic',
  ),
);

await edit('tests/e2e/unreadable-project-recovery.spec.ts', (source) =>
  replaceOnce(
    source,
    `    await expect(page.locator('[data-recovery-dialog]')).toBeVisible();\n    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {\n      timeout: 20_000,\n    });`,
    `    await expect(page.locator('[data-recovery-dialog]')).toBeVisible();\n${diagnostic}    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {\n      timeout: 20_000,\n    });`,
    'unreadable-recovery-diagnostic',
  ),
);

console.log('M8-02 targeted E2E fixes and recovery diagnostics applied.');
