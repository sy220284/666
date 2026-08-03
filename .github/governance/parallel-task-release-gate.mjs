/* global console, process */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function main() {
  execFileSync(process.execPath, ['.github/governance/single-work-release-gate.mjs'], {
    stdio: 'inherit',
    env: process.env,
  });
  console.log('Legacy release gate entry delegated to the single work release gate.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
