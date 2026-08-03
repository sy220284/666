/* global console, process */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function run(file, command) {
  execFileSync(process.execPath, [file, command], { stdio: 'inherit', env: process.env });
}

function main() {
  const command = process.argv[2] ?? 'validate';
  if (command === 'pr-policy') {
    run('.github/governance/single-work-policy.mjs', 'validate');
  } else if (command === 'self-test') {
    run('.github/governance/single-work-policy.mjs', 'self-test');
    run('.github/governance/single-work-taskctl.mjs', 'validate');
  } else {
    run('.github/governance/single-work-taskctl.mjs', command);
  }
  console.log('Legacy verification-hold entry delegated to the Schema 2 single work controller.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
