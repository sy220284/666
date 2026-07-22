import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadAuditRemediationManifest } from '../../scripts/audit-remediation-policy.mjs';

const temporaryDirectories: string[] = [];

function manifest(branch: string, manifestPath: string) {
  return {
    schemaVersion: 1,
    remediationId: `audit-${branch.split('audit-')[1]}`,
    baseCommit: 'a'.repeat(40),
    branch,
    activeTaskInvariant: { id: 'M4-01', mustMatchBase: true },
    verifiedTaskRepairs: [
      {
        taskId: 'M3-10',
        finding: 'Integrated audit repair fixture.',
        allowedPaths: ['packages/core-service/'],
      },
    ],
    evidenceMigrationTasks: ['M3-10'],
    governancePaths: [manifestPath],
  };
}

async function repositoryFixture() {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'worldforge-audit-manifest-'));
  temporaryDirectories.push(repositoryRoot);
  const directory = path.join(repositoryRoot, '.github/audit-remediations');
  await mkdir(directory, { recursive: true });
  return { repositoryRoot, directory };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('audit remediation manifest discovery', () => {
  it('selects the unique manifest whose branch matches the remediation branch', async () => {
    const { repositoryRoot, directory } = await repositoryFixture();
    const targetBranch = 'fix/governance-audit-m0-m3-integrated';
    const targetPath = '.github/audit-remediations/m0-m3-integrated.json';
    await writeFile(
      path.join(directory, 'm0-m3-integrated.json'),
      JSON.stringify(manifest(targetBranch, targetPath)),
    );
    await writeFile(
      path.join(directory, 'legacy.json'),
      JSON.stringify(
        manifest(
          'fix/governance-audit-legacy',
          '.github/audit-remediations/legacy.json',
        ),
      ),
    );

    await expect(
      loadAuditRemediationManifest({ repositoryRoot, branch: targetBranch }),
    ).resolves.toMatchObject({
      manifestPath: targetPath,
      manifest: { branch: targetBranch },
    });
  });

  it('rejects a remediation branch without a matching manifest', async () => {
    const { repositoryRoot, directory } = await repositoryFixture();
    await writeFile(
      path.join(directory, 'legacy.json'),
      JSON.stringify(
        manifest(
          'fix/governance-audit-legacy',
          '.github/audit-remediations/legacy.json',
        ),
      ),
    );

    await expect(
      loadAuditRemediationManifest({
        repositoryRoot,
        branch: 'fix/governance-audit-missing',
      }),
    ).rejects.toThrow('must match exactly one manifest; found 0');
  });

  it('rejects duplicate manifests for the same branch', async () => {
    const { repositoryRoot, directory } = await repositoryFixture();
    const branch = 'fix/governance-audit-duplicate';
    await writeFile(
      path.join(directory, 'one.json'),
      JSON.stringify(manifest(branch, '.github/audit-remediations/one.json')),
    );
    await writeFile(
      path.join(directory, 'two.json'),
      JSON.stringify(manifest(branch, '.github/audit-remediations/two.json')),
    );

    await expect(loadAuditRemediationManifest({ repositoryRoot, branch })).rejects.toThrow(
      'must match exactly one manifest; found 2',
    );
  });
});
