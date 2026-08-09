import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

const actionPins = new Map([
  ['actions/checkout', 'd23441a48e516b6c34aea4fa41551a30e30af803'],
  ['actions/setup-node', '249970729cb0ef3589644e2896645e5dc5ba9c38'],
  ['actions/upload-artifact', '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'],
  ['actions/download-artifact', '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c'],
  ['pnpm/action-setup', 'b906affcce14559ad1aafd4ab0e942779e9f58b1'],
]);

const fullValidationDraftMarker = '<!-- full-validation-draft -->';
const guardedDraftMode =
  "${{ github.event.pull_request.draft && !contains(github.event.pull_request.body || '', '<!-- full-validation-draft -->') }}";

export function parseWorkflowDocument(file, source) {
  let workflow;
  try {
    workflow = parseYaml(source);
  } catch (error) {
    throw new Error(`${file}: invalid YAML`, { cause: error });
  }
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    throw new Error(`${file}: workflow root must be an object`);
  }
  return workflow;
}

function validateAction(errors, file, step) {
  if (!step || typeof step !== 'object' || typeof step.uses !== 'string') return;
  if (step.uses.startsWith('./')) return;
  const separator = step.uses.lastIndexOf('@');
  const action = separator > 0 ? step.uses.slice(0, separator) : step.uses;
  const reference = separator > 0 ? step.uses.slice(separator + 1) : '';
  const expected = actionPins.get(action);
  if (!expected) {
    errors.push(`${file}: external action ${action} is not allowlisted`);
    return;
  }
  if (reference !== expected) {
    errors.push(`${file}: ${action} must use immutable SHA ${expected}`);
  }
  if (action === 'actions/checkout' && step.with?.['persist-credentials'] !== false) {
    errors.push(`${file}: every checkout must set persist-credentials: false`);
  }
}

export function validateWorkflowStructure(file, source) {
  const errors = [];
  let workflow;
  try {
    workflow = parseWorkflowDocument(file, source);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  if (!workflow.on || typeof workflow.on !== 'object' || Array.isArray(workflow.on)) {
    errors.push(`${file}: on must be a mapping`);
  }
  if (workflow.permissions === 'write-all') errors.push(`${file}: write-all is forbidden`);
  if (!workflow.jobs || typeof workflow.jobs !== 'object' || Array.isArray(workflow.jobs)) {
    errors.push(`${file}: jobs must be a mapping`);
    return errors;
  }

  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    if (!job || typeof job !== 'object' || Array.isArray(job)) {
      errors.push(`${file}: job ${jobName} must be a mapping`);
      continue;
    }
    if (job.permissions === 'write-all') errors.push(`${file}: job ${jobName} uses write-all`);
    if (typeof job.uses === 'string' && !job.uses.startsWith('./')) {
      errors.push(`${file}: reusable workflow ${job.uses} must be repository-local`);
    }
    for (const step of Array.isArray(job.steps) ? job.steps : [])
      validateAction(errors, file, step);
  }

  if (file === 'quality.yml') {
    const quality = workflow.jobs.quality;
    if (quality?.uses !== './.github/workflows/quality-core.yml') {
      errors.push('quality.yml: quality must call quality-core.yml');
    }
    if (quality?.with?.draft_mode !== guardedDraftMode) {
      errors.push(
        'quality.yml: quality.with.draft_mode must keep Draft merge blocking while allowing only the exact full-validation-draft HTML marker',
      );
    }
    const releaseAuditCondition = String(workflow.jobs['release-audit']?.if ?? '');
    if (!releaseAuditCondition.includes(fullValidationDraftMarker)) {
      errors.push(
        'quality.yml: release-audit must use the exact full-validation-draft HTML marker',
      );
    }
    if (quality?.with?.performance_eval !== false) {
      errors.push('quality.yml: quality.with.performance_eval must be false');
    }
    if (quality?.with?.package_smoke !== "${{ needs.route.outputs.package_smoke == 'true' }}") {
      errors.push('quality.yml: quality.with.package_smoke must be controlled by the route output');
    }
    if (quality?.with?.full_suite !== "${{ needs.route.outputs.full_suite == 'true' }}") {
      errors.push('quality.yml: quality.with.full_suite must be controlled by the route output');
    }
  }

  if (file === 'release.yml') {
    const quality = workflow.jobs.quality;
    if (quality?.uses !== './.github/workflows/quality-core.yml') {
      errors.push('release.yml: quality must call quality-core.yml');
    }
    for (const [name, expected] of [
      ['package_smoke', false],
      ['security_suite', true],
      ['performance_eval', true],
    ]) {
      if (quality?.with?.[name] !== expected) {
        errors.push(`release.yml: quality.with.${name} must be ${String(expected)}`);
      }
    }
    if (workflow.jobs.build?.needs !== 'release-gate') {
      errors.push('release.yml: build must need release-gate');
    }
    const publishNeeds = workflow.jobs.publish?.needs;
    const requiredPublishNeeds = ['quality', 'release-gate', 'build'];
    if (
      !Array.isArray(publishNeeds) ||
      requiredPublishNeeds.some((name) => !publishNeeds.includes(name))
    ) {
      errors.push('release.yml: publish must need quality, release-gate and build');
    }
  }

  if (file === 'security.yml') {
    const required = ['dependency-audit', 'secret-scan', 'application-security'];
    const needs = workflow.jobs.security?.needs;
    if (!Array.isArray(needs) || required.some((name) => !needs.includes(name))) {
      errors.push('security.yml: aggregate security job must need every security sub-job');
    }
    if (!source.includes(fullValidationDraftMarker)) {
      errors.push('security.yml: full validation must use the exact HTML marker');
    }
  }

  if (file === 'performance.yml' && !source.includes(fullValidationDraftMarker)) {
    errors.push('performance.yml: full validation must use the exact HTML marker');
  }

  return errors;
}

export async function validateWorkflowDirectory(root = process.cwd()) {
  const directory = path.join(root, '.github', 'workflows');
  const files = (await readdir(directory)).filter((file) => /\.ya?ml$/u.test(file)).sort();
  const errors = [];
  for (const file of files) {
    const source = await readFile(path.join(directory, file), 'utf8');
    errors.push(...validateWorkflowStructure(file, source));
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return files.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const count = await validateWorkflowDirectory();
  console.log(`Validated YAML structure for ${count} workflows.`);
}
