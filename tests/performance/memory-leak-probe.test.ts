import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Phase 3 memory leak steady-state gate', () => {
  it(
    'runs the Core memory probe with explicit GC and enforces its calibrated budget',
    () => {
      const result = spawnSync(
        process.execPath,
        ['--expose-gc', path.join('scripts', 'memory-leak-probe.mjs')],
        {
          cwd: process.cwd(),
          env: process.env,
          encoding: 'utf8',
          timeout: 150_000,
        },
      );
      if (result.error) throw result.error;
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      expect(result.signal).toBeNull();
      expect(result.status).toBe(0);
    },
    180_000,
  );
});
