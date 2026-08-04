import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertEvidenceHead,
  assertEvidenceSourceCommit,
  assertFinalEvidenceSemantics,
  evidenceImplementationCommit,
  REQUIRED_EVIDENCE_FILES,
  validateChangedEvidenceAtHead,
  validateTaskEvidence,
} from '../../scripts/evidence-policy.mjs';

const temporaryDirectories: string[] = [];

function hash(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function gitFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-evidence-head-'));
  temporaryDirectories.push(root);
  git(root, 'init');
  git(root, 'config', 'user.email', 'ci@example.invalid');
  git(root, 'config', 'user.name', 'CI Fixture');
  await writeFile(path.join(root, 'source.txt'), 'source\n');
  git(root, 'add', 'source.txt');
  git(root, 'commit', '-m', 'source');
  const sourceCommit = git(root, 'rev-parse', 'HEAD');
  await writeFile(path.join(root, 'implementation.txt'), 'implementation\n');
  git(root, 'add', 'implementation.txt');
  git(root, 'commit', '-m', 'implementation');
  const head = git(root, 'rev-parse', 'HEAD');
  return { root, sourceCommit, head };
}

async function evidenceFixture(schemaVersion: 1 | 2 = 1) {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-evidence-policy-'));
  temporaryDirectories.push(root);
  const taskId = 'M9-99';
  const directory = path.join(root, 'docs', 'test-evidence', taskId);
  const files = new Map<string, Buffer>();
  for (const relative of REQUIRED_EVIDENCE_FILES) {
    files.set(relative, Buffer.from(`${relative}\n`));
  }

  for (const [relative, content] of files) {
    const absolute = path.join(directory, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  const manifest = {
    schemaVersion,
    taskId,
    ...(schemaVersion === 1 ? { commit: 'abcdef1' } : { implementationCommit: 'abcdef1' }),
    generatedAt: '2026-07-18T00:00:00.000Z',
    files: [...files].map(([relative, content]) => ({
      path: relative,
      bytes: content.byteLength,
      sha256: hash(content),
    })),
  };
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, taskId, directory, manifest };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('evidence policy', () => {
  it('locks the mandatory package to three payload files plus manifest', () => {
    expect(REQUIRED_EVIDENCE_FILES).toEqual(['summary.md', 'commands.txt', 'known-risks.md']);
    expect(REQUIRED_EVIDENCE_FILES).not.toEqual(
      expect.arrayContaining(['screenshots', 'manual-acceptance.md', 'quality-matrix.md']),
    );
  });

  it('verifies documentation bytes, hashes and complete file registration', async () => {
    const legacy = await evidenceFixture(1);
    const current = await evidenceFixture(2);
    await expect(validateTaskEvidence(legacy.taskId, legacy.root)).resolves.toBeUndefined();
    await expect(validateTaskEvidence(current.taskId, current.root)).resolves.toBeUndefined();
    expect(evidenceImplementationCommit(legacy.manifest)).toBe('abcdef1');
    expect(evidenceImplementationCommit(current.manifest)).toBe('abcdef1');
  });

  it('returns cleanly when a revision changes no Evidence package and no legacy anchor exists', async () => {
    const fixture = await gitFixture();
    await expect(
      validateChangedEvidenceAtHead({
        repositoryRoot: fixture.root,
        baseSha: fixture.sourceCommit,
        expectedHead: fixture.head,
      }),
    ).resolves.toEqual([]);
  });

  it('rejects content changed after the manifest was generated', async () => {
    const fixture = await evidenceFixture();
    await writeFile(path.join(fixture.directory, 'summary.md'), 'changed after manifest\n');
    await expect(validateTaskEvidence(fixture.taskId, fixture.root)).rejects.toThrow(
      'evidence integrity mismatch: summary.md',
    );
  });

  it('rejects traversal and files omitted from the manifest', async () => {
    const fixture = await evidenceFixture();
    const manifestPath = path.join(fixture.directory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as typeof fixture.manifest;
    manifest.files[0]!.path = '../escape.txt';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await expect(validateTaskEvidence(fixture.taskId, fixture.root)).rejects.toThrow(
      'unsafe evidence path',
    );

    const restored = await evidenceFixture();
    await writeFile(path.join(restored.directory, 'unlisted.txt'), 'not in manifest\n');
    await expect(validateTaskEvidence(restored.taskId, restored.root)).rejects.toThrow(
      'evidence contains unlisted files: unlisted.txt',
    );
  });

  it('binds the CI check to the exact PR Head and the manifest to an implementation ancestor', async () => {
    const fixture = await gitFixture();
    expect(assertEvidenceHead(fixture.head, fixture.root)).toBe(fixture.head);
    expect(() =>
      assertEvidenceSourceCommit('M9-99', fixture.sourceCommit, fixture.head, fixture.root),
    ).not.toThrow();
    expect(() => assertEvidenceHead('0'.repeat(40), fixture.root)).toThrow('checkout SHA mismatch');
    expect(() =>
      assertEvidenceSourceCommit('M9-99', 'working-tree', fixture.head, fixture.root),
    ).toThrow('committed implementation revision');
    expect(() =>
      assertEvidenceSourceCommit('M9-99', fixture.head, fixture.sourceCommit, fixture.root),
    ).toThrow('not an ancestor');
  });
});

describe('final evidence semantics', () => {
  const documents = {
    summary: '# 验证摘要\n\n状态：Verified。',
    commands: 'pnpm test\nexit=0\n',
    knownRisks: '# 已知风险\n\n- 无。',
  };

  it('accepts committed documentation-only evidence with no stale state', () => {
    expect(() =>
      assertFinalEvidenceSemantics(
        'M2-01',
        { schemaVersion: 2, implementationCommit: 'a'.repeat(40) },
        documents,
      ),
    ).not.toThrow();
  });

  it('rejects working-tree and pending acceptance text', () => {
    expect(() =>
      assertFinalEvidenceSemantics(
        'M2-01',
        { schemaVersion: 2, implementationCommit: 'working-tree' },
        documents,
      ),
    ).toThrow('committed implementation revision');
    expect(() =>
      assertFinalEvidenceSemantics(
        'M2-01',
        { schemaVersion: 2, implementationCommit: 'a'.repeat(40) },
        {
          ...documents,
          summary: 'PENDING：等待CI。',
        },
      ),
    ).toThrow('stale implementation');
  });
});
