import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('M10-13 PrivacyLogger boundary', () => {
  it('records a dropped diagnostic without rejecting the business caller', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'worldforge-logger-'));
    temporaryDirectories.push(root);
    const blocker = path.join(root, 'not-a-directory');
    await writeFile(blocker, 'blocked', 'utf8');
    const logger = new PrivacyLogger(path.join(blocker, 'logs'), 'test');

    await expect(
      logger.log('info', 'business.operation.succeeded', {
        projectId: 'project-a',
        forbiddenContent: '正文不应写入日志',
      }),
    ).resolves.toBeUndefined();
    expect(logger.writeFailureCount).toBe(1);
  });
});
