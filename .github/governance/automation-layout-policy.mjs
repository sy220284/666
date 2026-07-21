import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { argv, cwd, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const root = cwd();

export const PERMANENT_WORKFLOWS = Object.freeze([
  'automerge.yml',
  'branch-hygiene.yml',
  'evidence.yml',
  'main-verification.yml',
  'performance.yml',
  'post-merge-verification.yml',
  'pr-policy.yml',
  'quality-core.yml',
  'quality.yml',
  'release.yml',
  'repository-governance.yml',
  'security.yml',
  'task-governance.yml',
]);

export const PERMANENT_GOVERNANCE_FILES = Object.freeze([
  'assert-clean-tree.mjs',
  'automation-layout-policy.mjs',
  'automerge-base-gate.mjs',
  'deferred-task-closure.mjs',
  'main-protection.json',
  'post-merge-verification.mjs',
  'required-checks.json',
  'stage-close-policy.mjs',
  'task-checkpoint-policy.mjs',
  'task-transition-policy.mjs',
]);

const forbiddenWorkflowMarkers = Object.freeze([
  {
    label: 'task id',
    pattern: /(?:^|[^A-Za-z0-9])M\d-\d{2}(?:[^A-Za-z0-9]|$)/u,
  },
  {
    label: 'task branch',
    pattern: /(?:work|feat|fix|test|chore)\/m\d-\d{2}(?:[-/][a-z0-9._-]+)*/iu,
  },
  {
    label: 'fixed pull request number',
    pattern: /pull_request\.number\s*={2,3}\s*\d+/u,
  },
  {
    label: 'fixed pull request branch',
    pattern: /github\.head_ref\s*={2,3}\s*['"][^'"]+['"]/u,
  },
]);

async function regularFileNames(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(`${entry.name}/`);
      continue;
    }
    if (!entry.isFile()) {
      files.push(`${entry.name} (unsupported entry)`);
      continue;
    }
    files.push(entry.name);
  }
  return files.sort();
}

function compareInventory(errors, label, actual, expected) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  for (const file of expected) {
    if (!actualSet.has(file)) errors.push(`${label}: missing permanent file ${file}`);
  }
  for (const file of actual) {
    if (!expectedSet.has(file)) errors.push(`${label}: unexpected automation file ${file}`);
  }
}

function scanWorkflowSource(errors, file, source) {
  for (const marker of forbiddenWorkflowMarkers) {
    if (marker.pattern.test(source)) {
      errors.push(`${file}: contains forbidden ${marker.label}`);
    }
  }
}

export async function validateAutomationLayout(repositoryRoot = root) {
  const workflowDirectory = path.join(repositoryRoot, '.github', 'workflows');
  const governanceDirectory = path.join(repositoryRoot, '.github', 'governance');
  const errors = [];

  const workflowFiles = (await regularFileNames(workflowDirectory)).filter((file) =>
    /\.ya?ml$/u.test(file),
  );
  const governanceFiles = await regularFileNames(governanceDirectory);

  compareInventory(errors, '.github/workflows', workflowFiles, PERMANENT_WORKFLOWS);
  compareInventory(
    errors,
    '.github/governance',
    governanceFiles,
    PERMANENT_GOVERNANCE_FILES,
  );

  for (const file of workflowFiles) {
    const source = await readFile(path.join(workflowDirectory, file), 'utf8');
    scanWorkflowSource(errors, `.github/workflows/${file}`, source);
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  return {
    workflows: workflowFiles.length,
    governanceFiles: governanceFiles.length,
  };
}

async function main() {
  const result = await validateAutomationLayout();
  stdout.write(
    `Automation layout policy passed for ${result.workflows} workflows and ${result.governanceFiles} governance files.\n`,
  );
}

if (argv[1] === fileURLToPath(import.meta.url)) await main();
