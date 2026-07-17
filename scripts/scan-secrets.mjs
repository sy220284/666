import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const patterns = [
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/gu],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{40,255}\b/gu],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/gu],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/gu],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,255}\b/gu],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gu],
];

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root });
  return output.toString('utf8').split('\0').filter(Boolean);
}

async function main() {
  const findings = [];
  for (const file of trackedFiles()) {
    const bytes = await readFile(path.join(root, file));
    if (bytes.includes(0)) continue;
    const source = bytes.toString('utf8');
    for (const [label, pattern] of patterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        findings.push(`${file}:${line}: ${label}`);
      }
    }
  }
  if (findings.length > 0) throw new Error(findings.join('\n'));
  console.log('Tracked-file secret scan passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
