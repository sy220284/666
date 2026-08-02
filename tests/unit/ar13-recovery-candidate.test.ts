import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

async function readCandidatePayloads(repositoryRoot: string): Promise<Record<string, string>> {
  const payloadRoot = path.join(
    repositoryRoot,
    'tests',
    'fixtures',
    'ar13-recovery-candidate',
  );
  const parts = (await readdir(payloadRoot)).filter((name) => name.endsWith('.txt')).sort();
  const encoded = (
    await Promise.all(parts.map((name) => readFile(path.join(payloadRoot, name), 'utf8')))
  ).join('');
  return JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')) as Record<
    string,
    string
  >;
}

describe('AR-13 Recovery candidate', () => {
  it('formats and typechecks the frozen Recovery split without touching production source', async () => {
    const repositoryRoot = process.cwd();
    const artifactRoot = path.join(
      repositoryRoot,
      'test-results',
      'unit',
      'ar13-recovery-candidate',
    );
    const workspaceRoot = path.join(artifactRoot, 'workspace');
    const packageRoot = path.join(workspaceRoot, 'packages', 'core-service');
    await mkdir(path.dirname(packageRoot), { recursive: true });
    await cp(path.join(repositoryRoot, 'packages', 'core-service'), packageRoot, {
      recursive: true,
    });
    await cp(
      path.join(repositoryRoot, 'tsconfig.base.json'),
      path.join(workspaceRoot, 'tsconfig.base.json'),
    );

    const candidatePayloads = await readCandidatePayloads(repositoryRoot);
    for (const [relativePath, source] of Object.entries(candidatePayloads)) {
      const destination = path.join(packageRoot, 'src', relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      const config = await resolveConfig(path.join(repositoryRoot, relativePath));
      const formatted = await format(source, {
        ...(config ?? {}),
        filepath: destination,
      });
      await writeFile(destination, formatted, 'utf8');
    }

    let diagnostics = '';
    try {
      const result = await execFileAsync(
        process.execPath,
        [
          path.join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
          '-p',
          path.join(packageRoot, 'tsconfig.json'),
          '--noEmit',
        ],
        { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      );
      diagnostics = `${result.stdout}${result.stderr}`.trim();
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; message?: string };
      diagnostics = `${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message ?? ''}`.trim();
    }

    await writeFile(path.join(artifactRoot, 'diagnostics.txt'), `${diagnostics}\n`, 'utf8');
    await writeFile(
      path.join(artifactRoot, 'checkpoint.json'),
      `${JSON.stringify(
        {
          checkpoint: 'AR-13_RECOVERY_CANDIDATE',
          headSha: process.env.GITHUB_SHA ?? null,
          files: Object.keys(candidatePayloads),
          diagnosticCount: diagnostics.length === 0 ? 0 : diagnostics.split(/\r?\n/u).length,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    expect(diagnostics).toBe('');
    throw new Error('AR-13_RECOVERY_CANDIDATE_READY');
  });
});
