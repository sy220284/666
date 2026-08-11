import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();

const activeDocuments = {
  execution: 'docs/PROJECT_EXECUTION_ENTRY.md',
  ci: 'docs/process/CI_WORKFLOW_ARCHITECTURE.md',
  release: 'docs/process/RELEASE_QUALIFICATION.md',
  readme: 'README.md',
};

function requireMarkers(errors, label, source, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) errors.push(`${label} is missing current marker: ${marker}`);
  }
}

export function validateActiveDocumentation(documents) {
  const errors = [];
  requireMarkers(errors, 'PROJECT_EXECUTION_ENTRY', documents.execution ?? '', [
    'main/work/governance',
    'pr-policy',
    'quality / quality',
    'security',
    'performance',
    'Release不读取任务Runtime作为产品发布权威',
  ]);
  requireMarkers(errors, 'CI_WORKFLOW_ARCHITECTURE', documents.ci ?? '', [
    'main` + 产品`work` + 治理`governance',
    'pr-policy',
    'quality / quality',
    'security',
    'performance',
    'synchronize-integrations',
  ]);
  requireMarkers(errors, 'RELEASE_QUALIFICATION', documents.release ?? '', [
    'ReleaseAcceptance',
    'main-verification=success',
    'UI Acceptance',
    'Windows Authenticode',
    'macOS Developer ID',
  ]);
  requireMarkers(errors, 'README', documents.readme ?? '', ['MIT License']);

  if (
    (documents.execution ?? '').includes('ACTIVE_TASK.json') &&
    !(documents.execution ?? '').includes('已经退役')
  ) {
    errors.push('PROJECT_EXECUTION_ENTRY mentions ACTIVE_TASK.json without declaring it retired');
  }
  if ((documents.ci ?? '').includes('固定分支仅允许`main`、`work`。')) {
    errors.push('CI documentation still declares the retired two-branch inventory');
  }
  if ((documents.release ?? '').includes('Task Runtime Release Gate')) {
    const line = (documents.release ?? '')
      .split(/\r?\n/u)
      .find((entry) => entry.includes('Task Runtime Release Gate'));
    if (line && !line.includes('不得恢复')) {
      errors.push('Release documentation appears to restore Task Runtime as release authority');
    }
  }
  return errors;
}

export async function runDocumentationConsistency(repositoryRoot = root) {
  const entries = await Promise.all(
    Object.entries(activeDocuments).map(async ([key, relativePath]) => [
      key,
      await readFile(path.join(repositoryRoot, relativePath), 'utf8'),
    ]),
  );
  const errors = validateActiveDocumentation(Object.fromEntries(entries));
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('Active documentation consistency audit passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDocumentationConsistency().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
