/* global console, process */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function delegate(command) {
  execFileSync(process.execPath, ['.github/governance/single-work-policy.mjs', command], {
    stdio: 'inherit',
    env: process.env,
  });
}

// Compatibility export for permanent self-tests that still import the legacy entry.
export function selfTest() {
  delegate('self-test');
}

// Compatibility entry only. The active repository policy is single-work-policy.mjs.
function main() {
  const command = process.argv[2] ?? 'validate';
  if (command === 'self-test') selfTest();
  else delegate(command);
  console.log('Legacy parallel-task-policy entry delegated to single-work-policy.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
