import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertFinalEvidenceSemantics,
  REQUIRED_EVIDENCE_FILES,
  validateTaskEvidence,
} from '../../scripts/evidence-policy.mjs';

const temporaryDirectories: string[] = [];

function hash(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function evidenceFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-evidence-policy-'));
  temporaryDirectories.push(root);
  const taskId = 'M9-99';
  const directory = path.join(root, 'docs', 'test-evidence', taskId);
  const files = new Map<string, Buffer>();
  for (const relative of REQUIRED_EVIDENCE_FILES) {
    const content = relative.endsWith('.json') ? Buffer.from('[]\n') : Buffer.from(`${relative}\n`);
    files.set(relative, content);
  }
  const screenshot = Buffer.from('deterministic-png-fixture');
  files.set('screenshots/example.png', screenshot);
  files.set(
    'screenshots/manifest.json',
    Buffer.from(
      `${JSON.stringify([{ fileName: 'example.png', fixtureId: taskId, sha256: hash(screenshot) }], null, 2)}\n`,
    ),
  );

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
  return { root, taskId, directory, manifest };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('evidence policy', () => {
  it('verifies bytes, hashes, screenshot references and complete file registration', async () => {
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
});

describe('final evidence semantics', () => {
  const documents = {
    summary: '# 验证摘要\n\n状态：Verified。',
    manualAcceptance: '# 人工验收\n\n结论：通过。',
    qualityMatrix: '# 质量矩阵\n\n结论：Verified。',
  };

  it('accepts committed M2 evidence with screenshots and no stale state', () => {
    expect(() =>
      assertFinalEvidenceSemantics(
        'M2-01',
        { commit: 'a'.repeat(40) },
        [{ fileName: 'lock.png', sha256: 'b'.repeat(64) }],
        documents,
      ),
    ).not.toThrow();
  });

  it('rejects working-tree, empty screenshots and pending acceptance text', () => {
    expect(() =>
      assertFinalEvidenceSemantics('M2-01', { commit: 'working-tree' }, [], documents),
    ).toThrow('committed revision');
    expect(() =>
      assertFinalEvidenceSemantics('M2-01', { commit: 'a'.repeat(40) }, [], documents),
    ).toThrow('desktop screenshot');
    expect(() =>
      assertFinalEvidenceSemantics(
        'M2-01',
        { commit: 'a'.repeat(40) },
        [{ fileName: 'lock.png', sha256: 'b'.repeat(64) }],
        { ...documents, manualAcceptance: '人工待运行' },
      ),
    ).toThrow('stale implementation');
  });
});
