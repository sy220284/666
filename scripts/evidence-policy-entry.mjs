/* global console, process */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const taskMarkerPattern = /<!--\s*worldforge-task:\s*(M\d+-\d{2})\s*-->/iu;

function git(argumentsList) {
  return execFileSync('git', argumentsList, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function taskIdFromPullBody(body) {
  return taskMarkerPattern.exec(body ?? '')?.[1]?.toUpperCase() ?? null;
}

export function isMaintenancePath(file) {
  const normalized = file.replaceAll('\\', '/');
  return (
    normalized.startsWith('.github/') ||
    normalized.startsWith('scripts/') ||
    normalized.startsWith('tests/') ||
    normalized.startsWith('docs/process/') ||
    normalized.endsWith('.md')
  );
}

export function evidenceEntryDecision({ final, pullBody, files }) {
  if (!final) return { action: 'delegate', reason: 'Draft evidence validation remains unchanged' };
  if (taskIdFromPullBody(pullBody)) {
    return { action: 'delegate', reason: 'Task PR requires strict final Evidence closure' };
  }
  const evidenceOrRuntime = files.some(
    (file) =>
      /^docs\/test-evidence\/M\d+-\d{2}\//u.test(file) ||
      /^docs\/tasks\/runtime\/M\d+-\d{2}\.json$/u.test(file),
  );
  if (evidenceOrRuntime) {
    return {
      action: 'reject',
      reason: 'Task Runtime or Evidence changes require a worldforge-task marker',
    };
  }
  const productFiles = files.filter((file) => !isMaintenancePath(file));
  if (productFiles.length > 0) {
    return {
      action: 'reject',
      reason: `Product changes require a worldforge-task marker: ${productFiles.join(', ')}`,
    };
  }
  return {
    action: 'maintenance',
    reason: 'Maintenance-only Ready PR does not require task Evidence closure',
  };
}

function changedFiles(baseSha) {
  if (!/^[0-9a-f]{40}$/iu.test(baseSha ?? '')) throw new Error('EVIDENCE_BASE_SHA is required');
  return git(['diff', '--name-only', baseSha, 'HEAD'])
    .split(/\r?\n/u)
    .filter(Boolean);
}

function booleanEnvironment(value) {
  return /^(?:1|true)$/iu.test(value ?? '');
}

function runDelegate(delegate) {
  if (delegate !== 'scripts/evidence-policy.mjs') {
    throw new Error('Evidence policy delegate must be scripts/evidence-policy.mjs');
  }
  const result = spawnSync(process.execPath, [delegate], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const delegate = process.argv[2];
  const decision = evidenceEntryDecision({
    final: booleanEnvironment(process.env.EVIDENCE_FINAL),
    pullBody: process.env.EVIDENCE_PR_BODY ?? '',
    files: changedFiles(process.env.EVIDENCE_BASE_SHA),
  });
  if (decision.action === 'reject') throw new Error(decision.reason);
  if (decision.action === 'maintenance') {
    console.log(decision.reason);
    return;
  }
  console.log(decision.reason);
  runDelegate(delegate);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
