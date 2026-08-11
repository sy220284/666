import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface VisualBaselineEntry {
  readonly snapshotName: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
}

export interface VisualBaselineManifest {
  readonly schemaVersion: 1;
  readonly platform: 'linux';
  readonly source: VisualBaselineSource;
  readonly stabilityWitness: VisualBaselineSource;
  readonly baselines: readonly VisualBaselineEntry[];
}

interface VisualBaselineSource {
  readonly verifiedHead: string;
  readonly qualityRunId: number;
  readonly artifactId: number;
  readonly artifactDigest: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const ARTIFACT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSource(value: unknown, label: string): VisualBaselineSource {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
  const { verifiedHead, qualityRunId, artifactId, artifactDigest } = value;
  if (typeof verifiedHead !== 'string' || !COMMIT_PATTERN.test(verifiedHead)) {
    throw new TypeError(`${label}.verifiedHead must be a 40-character commit SHA.`);
  }
  if (
    typeof qualityRunId !== 'number' ||
    !Number.isSafeInteger(qualityRunId) ||
    qualityRunId <= 0
  ) {
    throw new TypeError(`${label}.qualityRunId must be a positive integer.`);
  }
  if (typeof artifactId !== 'number' || !Number.isSafeInteger(artifactId) || artifactId <= 0) {
    throw new TypeError(`${label}.artifactId must be a positive integer.`);
  }
  if (typeof artifactDigest !== 'string' || !ARTIFACT_DIGEST_PATTERN.test(artifactDigest)) {
    throw new TypeError(`${label}.artifactDigest must be a sha256 digest.`);
  }
  return {
    verifiedHead,
    qualityRunId,
    artifactId,
    artifactDigest,
  };
}

function validateEntry(value: unknown, index: number): VisualBaselineEntry {
  if (!isRecord(value)) throw new TypeError(`Baseline ${index} must be an object.`);
  const { snapshotName, sha256, width, height } = value;
  if (typeof snapshotName !== 'string' || !snapshotName.endsWith('.png')) {
    throw new TypeError(`Baseline ${index}.snapshotName must be a PNG filename.`);
  }
  if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) {
    throw new TypeError(`Baseline ${index}.sha256 must be a lowercase SHA-256 hash.`);
  }
  if (typeof width !== 'number' || !Number.isSafeInteger(width) || width <= 0) {
    throw new TypeError(`Baseline ${index}.width must be a positive integer.`);
  }
  if (typeof height !== 'number' || !Number.isSafeInteger(height) || height <= 0) {
    throw new TypeError(`Baseline ${index}.height must be a positive integer.`);
  }
  return {
    snapshotName,
    sha256,
    width,
    height,
  };
}

export function validateVisualBaselineManifest(value: unknown): VisualBaselineManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.platform !== 'linux') {
    throw new TypeError('Visual baseline manifest must use schemaVersion 1 for linux.');
  }
  if (!Array.isArray(value.baselines) || value.baselines.length === 0) {
    throw new TypeError('Visual baseline manifest must contain baselines.');
  }
  const source = validateSource(value.source, 'source');
  const stabilityWitness = validateSource(value.stabilityWitness, 'stabilityWitness');
  if (
    source.verifiedHead === stabilityWitness.verifiedHead ||
    source.qualityRunId === stabilityWitness.qualityRunId ||
    source.artifactId === stabilityWitness.artifactId
  ) {
    throw new TypeError('Visual baseline source and stability witness must be independent runs.');
  }
  const baselines = value.baselines.map(validateEntry);
  const names = new Set<string>();
  for (const baseline of baselines) {
    if (names.has(baseline.snapshotName)) {
      throw new TypeError(`Duplicate visual baseline name: ${baseline.snapshotName}`);
    }
    names.add(baseline.snapshotName);
  }
  return {
    schemaVersion: 1,
    platform: 'linux',
    source,
    stabilityWitness,
    baselines,
  };
}

export function readPngDimensions(
  bytes: Buffer,
): { readonly width: number; readonly height: number } {
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    throw new TypeError('Visual snapshot is not a valid PNG header.');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function verifyVisualSnapshot(
  manifest: VisualBaselineManifest,
  snapshotName: string,
  bytes: Buffer,
): VisualBaselineEntry {
  const baseline = manifest.baselines.find((candidate) => candidate.snapshotName === snapshotName);
  if (!baseline) throw new Error(`Visual baseline is not registered: ${snapshotName}`);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== baseline.sha256) {
    throw new Error(`Visual baseline hash mismatch: ${snapshotName}`);
  }
  const dimensions = readPngDimensions(bytes);
  if (dimensions.width !== baseline.width || dimensions.height !== baseline.height) {
    throw new Error(`Visual baseline dimensions mismatch: ${snapshotName}`);
  }
  return baseline;
}

export async function loadVisualBaselineManifest(
  repositoryRoot: string,
  manifestPath = 'tests/e2e/visual-baselines/manifest.json',
): Promise<VisualBaselineManifest> {
  const rawManifest = await readFile(path.join(repositoryRoot, manifestPath), 'utf8');
  return validateVisualBaselineManifest(JSON.parse(rawManifest) as unknown);
}
