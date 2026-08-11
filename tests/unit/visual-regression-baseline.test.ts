import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  readPngDimensions,
  validateVisualBaselineManifest,
  verifyVisualSnapshot,
} from '../e2e/visual-regression-baseline.js';

function fakePng(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function source(seed: 'a' | 'c') {
  return {
    verifiedHead: seed.repeat(40),
    qualityRunId: seed === 'a' ? 1 : 3,
    artifactId: seed === 'a' ? 2 : 4,
    artifactDigest: `sha256:${seed.repeat(64)}`,
  };
}

function manifestFor(bytes: Buffer) {
  return validateVisualBaselineManifest({
    schemaVersion: 1,
    platform: 'linux',
    source: source('a'),
    stabilityWitness: source('c'),
    baselines: [
      {
        snapshotName: 'baseline.png',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        width: 1280,
        height: 800,
      },
    ],
  });
}

describe('visual regression baseline authority', () => {
  it('validates a pinned PNG by name, hash and dimensions', () => {
    const bytes = fakePng(1280, 800);
    const manifest = manifestFor(bytes);
    expect(verifyVisualSnapshot(manifest, 'baseline.png', bytes)).toMatchObject({
      snapshotName: 'baseline.png',
      width: 1280,
      height: 800,
    });
    expect(readPngDimensions(bytes)).toEqual({ width: 1280, height: 800 });
  });

  it('fails closed on duplicate names, hash drift and malformed PNGs', () => {
    expect(() =>
      validateVisualBaselineManifest({
        schemaVersion: 1,
        platform: 'linux',
        source: source('a'),
        stabilityWitness: source('c'),
        baselines: [
          {
            snapshotName: 'baseline.png',
            sha256: 'c'.repeat(64),
            width: 1280,
            height: 800,
          },
          {
            snapshotName: 'baseline.png',
            sha256: 'd'.repeat(64),
            width: 1280,
            height: 800,
          },
        ],
      }),
    ).toThrow(/Duplicate visual baseline name/u);

    const bytes = fakePng(1280, 800);
    const manifest = manifestFor(bytes);
    const drifted = Buffer.from(bytes);
    drifted[32] = 1;
    expect(() => verifyVisualSnapshot(manifest, 'baseline.png', drifted)).toThrow(/hash mismatch/u);
    expect(() => readPngDimensions(Buffer.from('not-png'))).toThrow(/valid PNG header/u);
  });
});
