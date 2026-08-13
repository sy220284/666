import { execFileSync, spawn } from 'node:child_process';
import { lstat, readFile, readlink } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const allowlistPath = path.join(root, '.github', 'governance', 'secret-scan-allowlist.json');
const allowMarker = /(?:secret-scan:\s*allow|pragma:\s*allowlist\s+secret)/iu;
const placeholderPattern =
  /(?:example|placeholder|replace[-_ ]?me|dummy|changeme|redacted|sample|test[-_ ]?only|x{6,})/iu;
const exactPatterns = [
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/gu],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{40,255}\b/gu],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/gu],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/gu],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,255}\b/gu],
  ['OpenAI API key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,255}\b/gu],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,255}\b/gu],
  ['npm access token', /\bnpm_[A-Za-z0-9]{30,255}\b/gu],
  ['Bearer credential', /\bBearer\s+[A-Za-z0-9._~+/-]{24,512}={0,2}\b/gu],
  [
    'Credential-bearing database URL',
    /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s:/@]+:[^\s/@]+@[^\s]+/giu,
  ],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gu],
];
const genericAssignment =
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret)\b\s*[:=]\s*["']([^"'\s]{24,512})["']/giu;

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root });
  return output.toString('utf8').split('\0').filter(Boolean);
}

function shannonEntropy(value) {
  const frequencies = new Map();
  for (const character of value) frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function credentialLike(value) {
  if (placeholderPattern.test(value)) return false;
  const classes = [/[a-z]/u, /[A-Z]/u, /\d/u, /[^A-Za-z0-9]/u].filter((pattern) =>
    pattern.test(value),
  ).length;
  return classes >= 3 && shannonEntropy(value) >= 3.6;
}

export function scanSecretLine(line) {
  if (allowMarker.test(line)) return [];
  const findings = [];
  for (const [label, pattern] of exactPatterns) {
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      if (!placeholderPattern.test(match[0])) findings.push(label);
    }
  }
  genericAssignment.lastIndex = 0;
  for (const match of line.matchAll(genericAssignment)) {
    if (credentialLike(match[1])) findings.push('High-entropy assigned credential');
  }
  return [...new Set(findings)];
}

export function scanSecretText(source) {
  const findings = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    for (const label of scanSecretLine(lines[index])) {
      findings.push({ line: index + 1, label });
    }
  }
  return findings;
}

export function scanGitPatchLines(lines) {
  const findings = [];
  let commit = 'unknown';
  let file = 'unknown';
  let newLine = 0;
  for (const line of lines) {
    if (line.startsWith('commit:')) {
      commit = line.slice('commit:'.length);
      continue;
    }
    if (line.startsWith('+++ b/')) {
      file = line.slice('+++ b/'.length);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      for (const label of scanSecretLine(line.slice(1))) {
        findings.push({ commit, file, line: newLine, label });
      }
      newLine += 1;
      continue;
    }
    if (!line.startsWith('-') && !line.startsWith('\\')) newLine += 1;
  }
  return findings;
}

export function prCommitRangeArguments(baseRef) {
  if (!/^[0-9a-f]{7,40}$/iu.test(baseRef ?? '')) throw new Error('Secret scan base ref is invalid');
  return [
    'log',
    `${baseRef}..HEAD`,
    '--format=commit:%H',
    '--no-ext-diff',
    '--no-renames',
    '--unified=0',
    '--no-color',
    '--diff-filter=AM',
    '-p',
  ];
}

async function trackedFileSource(file) {
  const filePath = path.join(root, file);
  const metadata = await lstat(filePath);
  if (metadata.isSymbolicLink()) return readlink(filePath);
  if (!metadata.isFile()) return null;
  const bytes = await readFile(filePath);
  if (bytes.includes(0)) return null;
  return bytes.toString('utf8');
}

async function scanTrackedFiles() {
  const findings = [];
  for (const file of trackedFiles()) {
    const source = await trackedFileSource(file);
    if (source === null) continue;
    for (const finding of scanSecretText(source)) {
      findings.push(`${file}:${finding.line}: ${finding.label}`);
    }
  }
  return findings;
}

async function gitPatch(argumentsList) {
  const child = spawn('git', argumentsList, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = [];
  const stderr = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const reader = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of reader) lines.push(line);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`Git secret scan failed with exit ${exitCode}: ${stderr.join('').trim()}`);
  }
  return scanGitPatchLines(lines);
}

async function scanHistory() {
  const findings = await gitPatch([
    'log',
    '--all',
    '--format=commit:%H',
    '--no-ext-diff',
    '--no-renames',
    '--unified=0',
    '--no-color',
    '--diff-filter=AM',
    '-p',
  ]);
  return findings.map(
    (finding) => `${finding.commit}:${finding.file}:${finding.line}: ${finding.label}`,
  );
}

async function scanCommitRange(baseRef) {
  const findings = await gitPatch(prCommitRangeArguments(baseRef));
  return findings.map((finding) => `${finding.file}:${finding.line}: ${finding.label}`);
}

async function loadAllowlist() {
  const document = JSON.parse(await readFile(allowlistPath, 'utf8'));
  if (document.schemaVersion !== 1 || !Array.isArray(document.entries)) {
    throw new Error('Secret scan allowlist must use schemaVersion 1 with an entries array');
  }
  const findings = new Set();
  for (const [index, entry] of document.entries.entries()) {
    if (
      typeof entry?.finding !== 'string' ||
      entry.finding.length === 0 ||
      typeof entry?.reason !== 'string' ||
      entry.reason.trim().length < 20
    ) {
      throw new Error(`Invalid secret scan allowlist entry at index ${index}`);
    }
    if (findings.has(entry.finding)) {
      throw new Error(`Duplicate secret scan allowlist finding: ${entry.finding}`);
    }
    findings.add(entry.finding);
  }
  return findings;
}

async function main() {
  const historyEnabled = process.argv.includes('--history');
  const baseIndex = process.argv.indexOf('--base');
  const baseRef = baseIndex >= 0 ? process.argv[baseIndex + 1] : null;
  if (historyEnabled && baseRef) throw new Error('Use either --history or --base, not both');

  const findings = await scanTrackedFiles();
  if (historyEnabled) findings.push(...(await scanHistory()));
  else if (baseRef) findings.push(...(await scanCommitRange(baseRef)));

  const uniqueFindings = [...new Set(findings)].sort();
  const allowlist = await loadAllowlist();
  const unapproved = uniqueFindings.filter((finding) => !allowlist.has(finding));
  if (unapproved.length > 0) throw new Error(unapproved.join('\n'));
  if (historyEnabled) {
    const staleEntries = [...allowlist].filter((finding) => !uniqueFindings.includes(finding));
    if (staleEntries.length > 0) {
      throw new Error(`Stale secret scan allowlist entries:\n${staleEntries.join('\n')}`);
    }
  }
  const approvedCount = uniqueFindings.length - unapproved.length;
  if (historyEnabled) {
    console.log(
      `Tracked-file and Git-history secret scan passed (${approvedCount} reviewed synthetic findings).`,
    );
  } else if (baseRef) {
    console.log(`Tracked-file and PR-commit-history secret scan passed from ${baseRef}.`);
  } else {
    console.log('Tracked-file secret scan passed.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
