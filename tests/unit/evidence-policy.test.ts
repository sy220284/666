import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertEvidenceHead,
  assertEvidenceSourceCommit,
  assertFinalEvidenceSemantics,
  REQUIRED_EVIDENCE_FILES,
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
  await writeFile(path.join(root, 'evidence.txt'), 'evidence\n');
  git(root, 'add', 'evidence.txt');
  git(root, 'commit', '-m', 'evidence');
  const head = git(root, 'rev-parse', 'HEAD');
  return { root, sourceCommit, head };
}

async function evidenceFixture(options: { readonly withScreenshot?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-evidence-policy-'));
  temporaryDirectories.push(root);
  const taskId = 'M9-99';
  const directory = path.join(root, 'docs', 'test-evidence', taskId);
  const screenshotName = 'acceptance.png';
  const screenshot = Buffer.from('real screenshot bytes');
  const screenshotManifest = options.withScreenshot
    ? [
        {
          fileName: screenshotName,
          fixtureId: 'M9-99-acceptance',
          sha256: hash(screenshot),
        },
      ]
    : [];
  const files = new Map<string, Buffer>();
  for (const relative of REQUIRED_EVIDENCE_FILES) {
    const value =
      relative === 'screenshots/manifest.json'
        ? `${JSON.stringify(screenshotManifest, null, 2)}\n`
        : `${relative}\n`;
    files.set(relative, Buffer.from(value));
  }
  if (options.withScreenshot) files.set(`screenshots/${screenshotName}`, screenshot);

  for (const [relative, content] of files) {
    const absolute = path.join(directory, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  const manifest = {
    schemaVersion: 1,
    taskId,
    commit: 'abcdef1',
    generatedAt: '2026-07-18T00:00:00.000Z',
    files: [...files].map(([relative, content]) => ({
      path: relative,
      bytes: content.byteLength,
      sha256: hash(content),
    })),
  };
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, taskId, directory, manifest, screenshotName };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('evidence policy', () => {
  it('verifies all required files, hashes and complete file registration', async () => {
    const fixture = await evidenceFixture();
    await expect(validateTaskEvidence(fixture.taskId, fixture.root)).resolves.toBeUndefined();
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

  it('rejects screenshot entries that are missing from the root evidence manifest', async () => {
    const fixture = await evidenceFixture({ withScreenshot: true });
    const manifestPath = path.join(fixture.directory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as typeof fixture.manifest;
    manifest.files = manifest.files.filter(
      (entry) => entry.path !== `screenshots/${fixture.screenshotName}`,
    );
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await expect(validateTaskEvidence(fixture.taskId, fixture.root)).rejects.toThrow(
      'screenshot is absent from the evidence manifest',
    );
  });

  it('binds validation to the exact checked-out PR Head and a committed ancestor', async () => {
    const fixture = await gitFixture();
    expect(assertEvidenceHead(fixture.head, fixture.root)).toBe(fixture.head);
    expect(() =>
      assertEvidenceSourceCommit('M9-99', fixture.sourceCommit, fixture.head, fixture.root),
    ).not.toThrow();
    expect(() => assertEvidenceHead('0'.repeat(40), fixture.root)).toThrow('checkout SHA mismatch');
    expect(() =>
      assertEvidenceSourceCommit('M9-99', 'working-tree', fixture.head, fixture.root),
    ).toThrow('committed source revision');
    expect(() =>
      assertEvidenceSourceCommit('M9-99', fixture.head, fixture.sourceCommit, fixture.root),
    ).toThrow('not an ancestor');
  });
});

describe('final evidence semantics', () => {
  const documents = {
    summary: '# 验证摘要\n\n状态：Verified。',
    manualAcceptance: '# 人工验收\n\n状态：通过。',
    qualityMatrix: '# 质量矩阵\n\n全部通过。',
  };
  const screenshot = {
    fileName: 'acceptance.png',
    fixtureId: 'M2-01-acceptance',
    sha256: 'b'.repeat(64),
  };

  it('accepts committed final evidence with no stale state', () => {
    expect(() =>
      assertFinalEvidenceSemantics(
        'M2-01',
        { commit: 'a'.repeat(40) },
        [screenshot],
        documents,
      ),
    ).not.toThrow();
  });

  it('requires a desktop screenshot for M2 final evidence', () => {
    expect(() =>
      assertFinalEvidenceSemantics('M2-01', { commit: 'a'.repeat(40) }, [], documents),
    ).toThrow('requires at least one desktop screenshot');
  });

  it('rejects working-tree and pending acceptance text', () => {
    expect(() =>
      assertFinalEvidenceSemantics('M2-01', { commit: 'working-tree' }, [screenshot], documents),
    ).toThrow('committed revision');
    expect(() =>
      assertFinalEvidenceSemantics(
        'M2-01',
        { commit: 'a'.repeat(40) },
        [screenshot],
        { ...documents, summary: 'PENDING：等待CI。' },
      ),
    ).toThrow('stale implementation');
  });
});
