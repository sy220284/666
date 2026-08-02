import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const preloadSource = 'apps/desktop/preload/src';
const readPreload = (fileName: string) => readFile(`${preloadSource}/${fileName}`, 'utf8');

describe('Preload capability surface', () => {
  it('exposes one named bridge without raw IPC or Node capabilities', async () => {
    const [root, app, project, planning, writing, recovery, task] = await Promise.all([
      readPreload('index.ts'),
      readPreload('app-bridge-factory.ts'),
      readPreload('project-bridge-factory.ts'),
      readPreload('planning-bridge-factory.ts'),
      readPreload('writing-bridge-factory.ts'),
      readPreload('recovery-bridge-factory.ts'),
      readPreload('task-bridge-factory.ts'),
    ]);
    const factories = [app, project, planning, writing, recovery, task].join('\n');

    expect(root).toContain("contextBridge.exposeInMainWorld('worldforge', bridge)");
    expect(root).not.toContain('ipcRenderer');
    expect(factories).not.toContain("from 'node:fs'");
    expect(factories).not.toContain('process.env');
    expect(factories).not.toContain('database');
    expect(factories).not.toMatch(/send\s*:\s*\(/);
    expect(factories).not.toContain('contextBridge');
    expect(task).toContain('ipcRenderer.postMessage');
    expect(task).toContain('TaskEventEnvelopeSchema.safeParse');
    expect(task).toContain("const task: WorldforgeBridge['task'] = {");
    expect(task).toContain('return { task };');
    expect(app).toContain('settings: {');
    expect(project).toContain('project: {');
    expect(planning).toContain('planning: {');
    expect(project).toContain('trash: {');
    expect(writing).toContain('draft: {');
    expect(factories).not.toContain('workspacePath');
  });
});
