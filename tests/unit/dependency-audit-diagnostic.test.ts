import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('temporary dependency audit diagnostic', () => {
  it('captures the complete pnpm audit result', async () => {
    let output = '';
    try {
      output = execFileSync('pnpm', ['audit', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const failure = error as { stdout?: string | Buffer; stderr?: string | Buffer };
      output = [failure.stdout?.toString() ?? '', failure.stderr?.toString() ?? '']
        .filter(Boolean)
        .join('\n');
    }
    await mkdir('test-results/unit/dependency-audit', { recursive: true });
    await writeFile('test-results/unit/dependency-audit/audit.json', output, 'utf8');
    expect.fail('DEPENDENCY_AUDIT_DIAGNOSTIC_READY');
  });
});
