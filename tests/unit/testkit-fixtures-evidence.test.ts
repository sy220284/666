import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseEvidenceArguments } from '../../scripts/write-test-evidence.mjs';
import {
  MALICIOUS_DOCX_FIXTURE_KINDS,
  createChineseLongChapterFixture,
  createChineseLongParagraphFixture,
  createMaliciousDocxFixture,
  createMillionCharacterSearchFixture,
  listZipEntryNames,
  writeTestEvidence,
  type TestEvidenceInput,
} from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-evidence-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('public deterministic Chinese fixtures', () => {
  it('generates exact long-paragraph, long-chapter, and 1.5M-character search inputs', () => {
    const paragraph = createChineseLongParagraphFixture();
    const chapter = createChineseLongChapterFixture();
    const search = createMillionCharacterSearchFixture();
    expect(paragraph).toMatchObject({ characters: 5_000, containsPrivateData: false });
    expect(paragraph.text).not.toContain('\n');
    expect(chapter).toMatchObject({ characters: 50_000, containsPrivateData: false });
    expect(search.characters).toBe(1_500_000);
    expect(search.chapterOffsets).toHaveLength(500);

    const observedOffsets: number[] = [];
    let offset = search.text.indexOf(search.needle);
    while (offset >= 0) {
      observedOffsets.push(offset);
      offset = search.text.indexOf(search.needle, offset + search.needle.length);
    }
    expect(observedOffsets).toEqual(search.expectedOffsets);
    expect(createMillionCharacterSearchFixture().sha256).toBe(search.sha256);
  });

  it('covers the public malicious DOCX set for SEC-042 through SEC-049', () => {
    const fixtures = MALICIOUS_DOCX_FIXTURE_KINDS.map(createMaliciousDocxFixture);
    expect(fixtures.map((fixture) => fixture.securityCaseId)).toEqual([
      'SEC-042',
      'SEC-043',
      'SEC-044',
      'SEC-045',
      'SEC-046',
      'SEC-047',
      'SEC-048',
      'SEC-049',
    ]);
    expect(fixtures.every((fixture) => !fixture.containsPrivateData)).toBe(true);
    expect(
      fixtures.find((fixture) => fixture.kind === 'compression-bomb')?.compressionRatio,
    ).toBeGreaterThan(100);
    expect(
      fixtures.find((fixture) => fixture.kind === 'too-many-files')?.entryCount,
    ).toBeGreaterThan(1_000);
    const traversal = fixtures.find((fixture) => fixture.kind === 'path-traversal');
    expect(listZipEntryNames(traversal?.bytes ?? [])).toContain('../outside-worldforge.xml');
    expect(createMaliciousDocxFixture('macro-enabled').sha256).toBe(
      createMaliciousDocxFixture('macro-enabled').sha256,
    );
  });

  it('registers only public synthetic Eval fixtures', async () => {
    const catalog = JSON.parse(await readFile('evals/fixtures/catalog.json', 'utf8')) as {
      readonly source: string;
      readonly containsPrivateData: boolean;
      readonly fixtures: readonly string[];
    };
    expect(catalog).toMatchObject({
      source: 'synthetic-public-test-data',
      containsPrivateData: false,
    });
    for (const fixture of catalog.fixtures) {
      const source = await readFile(path.join('evals/fixtures', fixture), 'utf8');
      expect(source).toContain('contains_private_data: false');
      expect(source).toContain('language: zh-CN');
    }
  });
});

describe('unified evidence writer', () => {
  const evidence = (summary = '所有自测使用公开、可复现 Fixture。'): TestEvidenceInput => ({
    taskId: 'M0-05',
    commit: 'abcdef0',
    generatedAt: '2026-07-15T03:00:00.000Z',
    summary,
    commands: [
      {
        command: 'pnpm test:unit',
        exitCode: 0,
        durationMilliseconds: 123,
        fixtureIds: ['zh-long-paragraph-v1'],
      },
    ],
    testResults: [
      {
        suite: 'testkit-self-test',
        fixtureId: 'zh-long-paragraph-v1',
        status: 'passed',
      },
    ],
    performance: [
      {
        taskId: 'M0-05',
        commit: 'abcdef0',
        environment: { os: 'test', cpu: 'test', memoryGb: 1, display: 'headless' },
        dataset: 'zh-search-1500000-v1',
        metric: 'fixture_generation_ms',
        samples: 1,
        result: 10,
        budget: 100,
        passed: true,
      },
    ],
    knownRisks: ['真实 Provider 与真实平台显示仍由后续验收覆盖。'],
  });

  it('writes reports, screenshots, performance, risks, and a hashed manifest atomically', async () => {
    const directory = await temporaryDirectory();
    const screenshot = path.join(directory, 'public-screenshot.png');
    await writeFile(screenshot, 'synthetic-public-image', 'utf8');
    const target = path.join(directory, 'M0-05');
    const result = await writeTestEvidence(target, {
      ...evidence(),
      screenshots: [
        { sourcePath: screenshot, fileName: 'desktop.png', fixtureId: 'electron-shell-v1' },
      ],
    });
    expect(result.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'commands.txt',
        'known-risks.md',
        'manifest.json',
        'performance.json',
        'screenshots/desktop.png',
        'screenshots/manifest.json',
        'summary.md',
        'test-results/results.json',
      ]),
    );
    expect(await readFile(path.join(target, 'summary.md'), 'utf8')).toContain('通过：1');
    expect(
      JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8')).files,
    ).toHaveLength(7);

    await writeTestEvidence(target, evidence('原子覆盖后的公开摘要。'), { overwrite: true });
    expect(await readFile(path.join(target, 'summary.md'), 'utf8')).toContain('原子覆盖后');
  });

  it('rejects credential-shaped content before creating an evidence directory', async () => {
    const target = path.join(await temporaryDirectory(), 'blocked');
    const credentialShapedValue = `ghp_${'a'.repeat(36)}`;
    await expect(writeTestEvidence(target, evidence(credentialShapedValue))).rejects.toThrow(
      /EVIDENCE_SECRET_DETECTED/,
    );
  });

  it('requires explicit CLI input/output paths and supports deliberate replacement', () => {
    expect(
      parseEvidenceArguments([
        '--input',
        'result.json',
        '--output',
        'docs/test-evidence/M0-05',
        '--overwrite',
      ]),
    ).toEqual({
      input: 'result.json',
      output: 'docs/test-evidence/M0-05',
      overwrite: true,
    });
    expect(() => parseEvidenceArguments(['--input', 'result.json'])).toThrow(/Usage/);
  });
});
