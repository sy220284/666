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

console.log('M8-02 formal Electron timing and cleanup fixes applied.');
