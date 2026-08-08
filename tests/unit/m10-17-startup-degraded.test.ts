import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectionStartupState,
  nullableStartupState,
} from '../../apps/desktop/renderer/src/app/use-workspace-startup.js';

const appRoot = path.join(process.cwd(), 'apps/desktop/renderer/src/app');

describe('M10-17 startup degraded state', () => {
  it('distinguishes successful empty payloads from loaded payloads', () => {
    expect(collectionStartupState([])).toBe('empty');
    expect(collectionStartupState(['task'])).toBe('loaded');
    expect(nullableStartupState(null)).toBe('empty');
    expect(nullableStartupState({ chapterId: 'chapter' })).toBe('loaded');
  });

  it('keeps task, provider and continuation failures explicit and resynchronizes tasks', async () => {
    const [startup, runtime] = await Promise.all([
      readFile(path.join(appRoot, 'use-workspace-startup.ts'), 'utf8'),
      readFile(path.join(appRoot, 'use-workspace-runtime.ts'), 'utf8'),
    ]);

    expect(startup).toContain("setResourceState('tasks', 'degraded')");
    expect(startup).toContain("setResourceState('providers', 'degraded')");
    expect(startup).toContain("setResourceState('continuation', 'degraded')");
    expect(startup).toContain("failureFromOutcome('活动任务读取失败'");
    expect(startup).toContain("failureFromOutcome('AI连接配置读取失败'");
    expect(startup).toContain("failureFromOutcome('续写状态读取失败'");

    expect(runtime).toContain("WorkspaceStartupResourceState = 'loaded' | 'empty' | 'degraded'");
    expect(runtime).toContain('bridge.task.listActive(projectIdRef.current');
    expect(runtime).toContain('bridge.task.subscribe(() => void refreshTasks())');
    expect(runtime).not.toContain('bridge.task.subscribe(() => void refreshTasks(), projectId)');
    expect(runtime).toContain('[projectId, refreshTasks]');
    expect(runtime).toContain("setStartupResourceState('tasks', 'degraded')");
  });
});
