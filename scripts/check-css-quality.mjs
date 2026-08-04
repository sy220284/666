import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_ROOT = 'apps/desktop/renderer/src';

async function listCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listCssFiles(target)));
    else if (entry.isFile() && entry.name.endsWith('.css')) files.push(target);
  }
  return files;
}

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '');
}

function delimiterError(source) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (const character of withoutComments(source)) {
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth < 0) return 'contains an unmatched closing brace';
  }
  if (quote) return 'contains an unterminated string';
  if (depth !== 0) return 'contains unmatched braces';
  return null;
}

export function validateCssSource(source) {
  const violations = [];
  if (!source.endsWith('\n')) violations.push('must end with a newline');
  if (source.includes('\r')) violations.push('must use LF line endings');
  if (/\t/u.test(source)) violations.push('must not contain tab indentation');
  if (/(?:@import\s+(?:url\()?|url\()\s*['"]?(?:https?:|\/\/)/iu.test(source)) {
    violations.push('must not load remote CSS or assets');
  }
  if (/(?:^|[;{])\s*[-\w]+\s*:\s*;/gmu.test(withoutComments(source))) {
    violations.push('contains an empty declaration value');
  }
  const delimiterViolation = delimiterError(source);
  if (delimiterViolation) violations.push(delimiterViolation);
  return violations;
}

export async function inspectCssQuality(repositoryRoot = DEFAULT_ROOT) {
  const files = await listCssFiles(path.join(repositoryRoot, CSS_ROOT));
  const violations = [];
  for (const file of files) {
    const relative = path.relative(repositoryRoot, file).split(path.sep).join('/');
    const source = await readFile(file, 'utf8');
    for (const violation of validateCssSource(source)) violations.push(`${relative}: ${violation}`);
  }
  if (violations.length > 0) throw new Error(violations.sort().join('\n'));
  return files.length;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const files = await inspectCssQuality();
  console.log(`Validated ${files} CSS files with high-confidence static checks.`);
}
