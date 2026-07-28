import { readFile, rm, writeFile } from 'node:fs/promises';

async function read(path) {
  return readFile(path, 'utf8');
}

async function write(path, content) {
  await writeFile(path, content, 'utf8');
}

function replaceExact(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, received ${count}`);
  return content.replace(before, after);
}

let home = await read('apps/desktop/renderer/src/features/home/home-page.tsx');
home = replaceExact(
  home,
  `import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';`,
  `import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';`,
  'home dialog portal import',
);
home = replaceExact(
  home,
  `      {creating ? (
        <CreateProjectDialog
          disclosureMode={props.disclosureMode}
          entry={entry}
          pending={props.pendingKey === 'project.create'}
          providerAvailable={props.providerAvailable}
          onCancel={closeCreateDialog}
          onCreate={async (plan) => {
            const created = await props.onCreate(plan);
            if (created) closeCreateDialog();
          }}
          onEntryChange={setEntry}
        />
      ) : null}`,
  `      {creating
        ? createPortal(
            <CreateProjectDialog
              disclosureMode={props.disclosureMode}
              entry={entry}
              pending={props.pendingKey === 'project.create'}
              providerAvailable={props.providerAvailable}
              onCancel={closeCreateDialog}
              onCreate={async (plan) => {
                const created = await props.onCreate(plan);
                if (created) closeCreateDialog();
              }}
              onEntryChange={setEntry}
            />,
            document.body,
          )
        : null}`,
  'portal project creation dialog',
);
await write('apps/desktop/renderer/src/features/home/home-page.tsx', home);

let writing = await read(
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
);
writing = replaceExact(
  writing,
  `  useEffect(() => {
    if (!statusNotice || panel !== 'editor') return;
    setStatus(statusNotice);
    onStatusNoticeConsumed?.();
  }, [onStatusNoticeConsumed, panel, setStatus, statusNotice]);`,
  `  useEffect(() => {
    if (!statusNotice || panel !== 'editor' || !editorReady) return;
    setStatus(statusNotice);
    onStatusNoticeConsumed?.();
  }, [editorReady, onStatusNoticeConsumed, panel, setStatus, statusNotice]);`,
  'consume restore notice after editor ready',
);
await write('apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx', writing);

let e2e = await read('tests/e2e/electron-shell.spec.ts');
e2e = replaceExact(
  e2e,
  `import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';`,
  `import { mkdtemp, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';`,
  'realpath import',
);
e2e = replaceExact(
  e2e,
  `    await expect(page.locator('[data-active-project-path]')).toHaveText(sourceWorkspace);`,
  `    await expect(page.locator('[data-active-project-path]')).toHaveText(
      await realpath(sourceWorkspace),
    );`,
  'canonical source workspace expectation',
);
e2e = replaceExact(
  e2e,
  `    await expect(page.locator('[data-active-project-path]')).toHaveText(movedWorkspace);`,
  `    await expect(page.locator('[data-active-project-path]')).toHaveText(
      await realpath(movedWorkspace),
    );`,
  'canonical moved workspace expectation',
);
e2e = replaceExact(
  e2e,
  `    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');`,
  `    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
    await page.keyboard.press('Backspace');`,
  'platform-aware block merge key',
);
await write('tests/e2e/electron-shell.spec.ts', e2e);

let remaining = await read('.github/workflows/m8-02-remaining-validation.yml');
remaining = replaceExact(
  remaining,
  `      - name: Run Linux packaged startup
        if: matrix.platform == 'linux'
        run: xvfb-run -a node scripts/smoke-packaged-desktop.mjs --platform linux --directory release/linux`,
  `      - name: Run Linux packaged startup
        if: matrix.platform == 'linux'
        env:
          WORLDFORGE_PACKAGED_SMOKE_ALLOW_NO_SANDBOX: '1'
        run: xvfb-run -a node scripts/smoke-packaged-desktop.mjs --platform linux --directory release/linux`,
  'linux CI sandbox fallback',
);
await write('.github/workflows/m8-02-remaining-validation.yml', remaining);

await rm('scripts/m8-02-cross-platform-e2e-fix-codemod.mjs');
await rm('.github/workflows/m8-02-cross-platform-e2e-fix-codemod.yml');
