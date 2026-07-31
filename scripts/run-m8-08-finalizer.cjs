const fs = require('node:fs');

const workflowPath = '.github/workflows/m8-08-cross-platform-evidence.yml';
const source = fs.readFileSync(workflowPath, 'utf8');
const startMarker = "          node <<'NODE'\n";
const endMarker = '\n          NODE\n';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start + startMarker.length);

if (start < 0 || end < 0) {
  throw new Error('Cannot locate the embedded M8-08 finalizer script');
}

let embedded = source.slice(start + startMarker.length, end);
embedded = embedded
  .split('\n')
  .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
  .join('\n');
embedded = embedded.replace(
  "fs.rmSync('.github/workflows/m8-08-cross-platform-evidence.yml');",
  '',
);

const execute = new Function(
  'require',
  'process',
  `return (async () => {\n${embedded}\n})();`,
);

execute(require, process).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
