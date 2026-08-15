import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { projectCloneAction } from '../../packages/core-service/src/recovery/project-clone-policy.js';

describe('M12-01 Project Journal governance', () => {
  it('keeps journal preferences and entries inside the existing project clone lifecycle', () => {
    expect(projectCloneAction('project_journal_preferences')).toBe('clone-remap');
    expect(projectCloneAction('project_journal_entries')).toBe('clone-remap');
  });

  it('does not introduce a generic event-sourcing or project-event authority', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'migrations/project/0036_project_journal.sql'),
      'utf8',
    );
    const service = readFileSync(
      resolve(process.cwd(), 'packages/core-service/src/journal-service.ts'),
      'utf8',
    );
    const architecture = readFileSync(
      resolve(process.cwd(), 'docs/architecture/PROJECT_JOURNAL.md'),
      'utf8',
    );
    const implementation = `${migration}\n${service}`.toLowerCase();

    expect(implementation).not.toContain('create table project_events');
    expect(implementation).not.toContain('create table journal_events');
    expect(implementation).not.toContain('event sourcing');
    expect(architecture).toContain('不允许引入');
    expect(architecture).toContain('project_events');
  });

  it('keeps scheduled catch-up local and free of cloud scheduler infrastructure', () => {
    const period = readFileSync(
      resolve(process.cwd(), 'packages/core-service/src/journal-period.ts'),
      'utf8',
    ).toLowerCase();
    const renderer = readFileSync(
      resolve(process.cwd(), 'apps/desktop/renderer/src/app/app-shell-pages.tsx'),
      'utf8',
    );

    expect(period).not.toContain('cron');
    expect(period).not.toContain('remote');
    expect(renderer).toContain('worldforgeJournal.catchUp');
  });
});
