import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const preloadSource = path.resolve('apps/desktop/preload/src');
const readSource = (fileName: string): string =>
  readFileSync(path.join(preloadSource, fileName), 'utf8');

const factories = [
  ['app-bridge-factory.ts', 'createAppBridge'],
  ['recovery-bridge-factory.ts', 'createRecoveryBridge'],
  ['project-bridge-factory.ts', 'createProjectBridge'],
  ['planning-bridge-factory.ts', 'createPlanningBridge'],
  ['writing-bridge-factory.ts', 'createWritingBridge'],
  ['task-bridge-factory.ts', 'createTaskBridge'],
] as const;

describe('AR-09 preload factory boundaries', () => {
  it('keeps the preload root as a thin bridge composition entry', () => {
    const source = readSource('index.ts');
    expect(source.split('\n').length).toBeLessThanOrEqual(80);
    expect(source).toContain("contextBridge.exposeInMainWorld('worldforge', bridge)");
    expect(source).toContain('lifecycle: rendererLifecycleBridge');
    for (const [, factory] of factories) {
      expect(source).toContain(`...${factory}()`);
    }
    expect(source).not.toContain('ipcRenderer.invoke');
    expect(source).not.toContain('TaskEventCursor');
  });

  it('centralizes envelopes and validated IPC invocation in one runtime', () => {
    const source = readSource('bridge-runtime.ts');
    expect(source).toContain('protocolVersion: PROTOCOL_VERSION');
    expect(source).toContain('requestId: globalThis.crypto.randomUUID()');
    expect(source).toContain('sentAt: new Date().toISOString()');
    expect(source).toContain('resultSchema.parse(raw)');
    expect(source.match(/ipcRenderer\.invoke/gu)).toHaveLength(1);
  });

  it('keeps domain factories isolated from Node and direct world exposure', () => {
    for (const [fileName, factory] of factories) {
      const source = readSource(fileName);
      expect(source).toContain(`export function ${factory}`);
      expect(source).toContain("from './bridge-runtime.js'");
      expect(source).not.toMatch(/node:(?:fs|path|sqlite|child_process)/u);
      expect(source).not.toContain('contextBridge');
      expect(source.split('\n').length).toBeLessThanOrEqual(350);
    }
  });

  it('preserves task ACK, duplicate suppression and sequence-gap recovery', () => {
    const source = readSource('task-bridge-factory.ts');
    expect(source).toContain('TaskEventAckSchema.parse');
    expect(source).toContain('const cursor = new TaskEventCursor()');
    expect(source).toContain("disposition.kind === 'accepted'");
    expect(source).toContain("disposition.kind !== 'gap'");
    expect(source).toContain('.getSnapshot(parsed.data.taskId, parsed.data.projectId)');
    expect(source).toContain("reason: 'sequence-gap'");
    expect(source).toContain('channel.port1.close()');
  });

  it('retains all existing independent bridge surfaces', () => {
    for (const [fileName, globalName] of [
      ['continuity-bridge.ts', 'worldforgeContinuity'],
      ['narrative-planning-bridge.ts', 'worldforgeNarrativePlanning'],
      ['rhythm-bridge.ts', 'worldforgeRhythm'],
      ['search-tools-bridge.ts', 'worldforgeSearchTools'],
      ['state-proposal-bridge.ts', 'worldforgeStateProposal'],
      ['validation-bridge.ts', 'worldforgeValidation'],
    ] as const) {
      expect(readSource(fileName)).toContain(
        `contextBridge.exposeInMainWorld('${globalName}'`,
      );
    }
    expect(readSource('entry.ts')).toContain(
      "contextBridge.exposeInMainWorld('worldforgeCandidatePreview'",
    );
  });
});
