import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function replaceExact(relative, before, after) {
  const target = path.join(root, relative);
  const source = await readFile(target, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${relative}: expected one match, found ${count}`);
  await writeFile(target, source.replace(before, after));
}

await replaceExact(
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  `    [activeProject, disclosureMode, refreshWorkspace, route, transitionToRoute],
  );`,
  `    [
      activeProject,
      availability,
      disclosureMode,
      refreshWorkspace,
      route,
      transitionToRoute,
    ],
  );`,
);

await replaceExact(
  'tests/unit/app-shell-capability-actions.test.ts',
  `    expect(shell).toContain('projectCapabilities={capabilities.project}');
    expect(shell).toContain('!capabilities.project.moveAvailable');`,
  `    expect(shell).toContain('projectCapabilities={capabilities.project}');
    expect(shell).toContain('!capabilities.project.moveAvailable');
    expect(shell).toContain('availability,\\n      disclosureMode');`,
);
