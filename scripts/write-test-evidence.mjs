import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function parseEvidenceArguments(arguments_) {
  const result = { overwrite: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--overwrite') {
      result.overwrite = true;
      continue;
    }
    if (argument !== '--input' && argument !== '--output') {
      throw new Error(`Unknown evidence option: ${argument}`);
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    result[argument.slice(2)] = value;
    index += 1;
  }
  if (!result.input || !result.output) {
    throw new Error('Usage: --input <evidence.json> --output <directory> [--overwrite]');
  }
  return result;
}

async function run() {
  const options = parseEvidenceArguments(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const { writeTestEvidence } = await import('../packages/testkit/dist/index.js');
  const result = await writeTestEvidence(outputPath, input, { overwrite: options.overwrite });
  process.stdout.write(
    `Evidence written to ${result.outputDirectory} (${result.files.length} files).\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
