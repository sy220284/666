/* global console, process */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Compatibility entry. Schema 2 task control is implemented by single-work-taskctl.mjs.
function main() {
  const command = process.argv[2] ?? 'validate';
  const rest = process.argv.slice(3);
  execFileSync(
    process.execPath,
    ['.github/governance/single-work-taskctl.mjs', command, ...rest],
    { stdio: 'inherit', env: process.env },
  );
  console.log('Legacy taskctl entry delegated to the Schema 2 single work controller.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
