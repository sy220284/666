import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

const actionPins = new Map([
  [
    'actions/checkout',
    {
      preferred: 'de0fac2e4500dabe0009e67214ff5f5447ce83dd',
      allowed: new Set([
        'd23441a48e516b6c34aea4fa41551a30e30af803',
        'de0fac2e4500dabe0009e67214ff5f5447ce83dd',
      ]),
    },
  ],
  [
    'actions/setup-node',
    {
      preferred: '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      allowed: new Set([
        '249970729cb0ef3589644e2896645e5dc5ba9c38',
        '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
      ]),
    },
  ],
  [
    'actions/upload-artifact',
    {
      preferred: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      allowed: new Set(['043fb46d1a93c77aae656e7c1c64a875d1fc6a0a']),
    },
  ],
  [
    'actions/download-artifact',
    {
      preferred: '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      allowed: new Set(['3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c']),
    },
  ],
  [
    'pnpm/action-setup',
    {
      preferred: '0ebf47130e4866e96fce0953f49152a61190b271',
      allowed: new Set([
        'b906affcce14559ad1aafd4ab0e942779e9f58b1',
        '0ebf47130e4866e96fce0953f49152a61190b271',
      ]),
    },
  ],
]);

const fullValidationDraftMarker = '<!-- full-validation-draft -->';
const guardedDraftMode =
  "${{ github.event.pull_request.draft && !contains(github.event.pull_request.body || '', '<!-- full-validation-draft -->') }}";
const pullRequestBaseSha = '${{ github.event.pull_request.base.sha }}';
const unifiedQualityRoutes = [
  'ci-risk-policy.mjs full-suite',
  'ci-risk-policy.mjs package-smoke',
  'ci-risk-policy.mjs toolchain-export',
  'ci-risk-policy.mjs reliability',
  'ci-risk-policy.mjs windows-ime',
];

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
  const policy = actionPins.get(action);
  if (!policy) {
    errors.push(`${file}: external action ${action} is not allowlisted`);
    return;
  }
  if (!policy.allowed.has(reference)) {
    errors.push(`${file}: ${action} must use immutable SHA ${policy.preferred}`);
  }
  if (action === 'actions/checkout' && step.with?.['persist-credentials'] !== false) {
    errors.push(`${file}: every checkout must set persist-credentials: false`);
  }
}

function hasEveryNeed(job, required) {
  const needs = job?.needs;
  return Array.isArray(needs) && required.every((name) => needs.includes(name));
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
    const qualityCore = workflow.jobs['quality-core'];
    if (qualityCore?.uses !== './.github/workflows/quality-core.yml') {
      errors.push('quality.yml: quality-core must call quality-core.yml');
    }
    if (qualityCore?.with?.draft_mode !== guardedDraftMode) {
      errors.push(
        'quality.yml: quality-core.with.draft_mode must keep Draft merge blocking while allowing only the exact full-validation-draft HTML marker',
      );
    }
    if (qualityCore?.with?.performance_eval !== false) {
      errors.push('quality.yml: quality-core.with.performance_eval must be false');
    }
    if (qualityCore?.with?.package_smoke !== "${{ needs.route.outputs.package_smoke == 'true' }}") {
      errors.push(
        'quality.yml: quality-core.with.package_smoke must be controlled by the route output',
      );
    }
    if (
      qualityCore?.with?.reliability_suite !== "${{ needs.route.outputs.reliability == 'true' }}"
    ) {
      errors.push(
        'quality.yml: quality-core.with.reliability_suite must be controlled by the route output',
      );
    }
    if (qualityCore?.with?.full_suite !== "${{ needs.route.outputs.full_suite == 'true' }}") {
      errors.push(
        'quality.yml: quality-core.with.full_suite must be controlled by the route output',
      );
    }
    const routeStep = workflow.jobs.route?.steps?.find(
      (step) => step?.name === 'Determine PR quality route from unified risk plan',
    );
    const routeScript = String(routeStep?.run ?? '');
    for (const route of unifiedQualityRoutes) {
      if (!routeScript.includes(route)) {
        errors.push(`quality.yml: unified risk routing must invoke ${route}`);
      }
    }

    const windowsIme = workflow.jobs['windows-native-ime'];
    if (windowsIme?.needs !== 'route') {
      errors.push('quality.yml: windows-native-ime must depend on the risk route');
    }
    if (!String(windowsIme?.if ?? '').includes("needs.route.outputs.windows_ime == 'true'")) {
      errors.push('quality.yml: windows-native-ime must be enabled by the unified risk route');
    }
    if (source.includes('chinese-experience-verification-closure')) {
      errors.push('quality.yml: Windows IME must not depend on the retired task-specific marker');
    }

    const releaseAudit = workflow.jobs['release-audit'];
    const releaseAuditCondition = String(releaseAudit?.if ?? '');
    if (!releaseAuditCondition.includes(fullValidationDraftMarker)) {
      errors.push(
        'quality.yml: release-audit must use the exact full-validation-draft HTML marker',
      );
    }
    const evidenceScan = releaseAudit?.steps?.find(
      (step) => step?.name === 'Scan effective Verified Evidence',
    );
    if (evidenceScan?.env?.TASK_BASE_REF !== pullRequestBaseSha) {
      errors.push(
        'quality.yml: Verified Evidence scan must receive the current pull request base SHA as TASK_BASE_REF',
      );
    }

    const packageGate = workflow.jobs['package-smoke-gate'];
    if (!hasEveryNeed(packageGate, ['route', 'quality-core'])) {
      errors.push('quality.yml: package-smoke-gate must depend on route and quality-core');
    }

    const quality = workflow.jobs.quality;
    if (quality?.name !== 'quality / quality') {
      errors.push('quality.yml: final quality authority must publish quality / quality');
    }
    if (!hasEveryNeed(quality, ['quality-core', 'release-audit', 'package-smoke-gate'])) {
      errors.push(
        'quality.yml: final quality authority must depend on quality-core, release-audit and package-smoke-gate',
      );
    }
  }

  if (file === 'quality-core.yml') {
    const reliabilityInput = workflow.on?.workflow_call?.inputs?.reliability_suite;
    if (reliabilityInput?.type !== 'boolean' || reliabilityInput?.default !== true) {
      errors.push('quality-core.yml: reliability_suite must be a boolean defaulting to true');
    }
    const reliability = workflow.jobs['reliability-tests'];
    if (!String(reliability?.if ?? '').includes('inputs.reliability_suite')) {
      errors.push('quality-core.yml: reliability-tests must be controlled by reliability_suite');
    }
    const reliabilityRun = reliability?.steps?.find(
      (step) => step?.name === 'Run reliability invariants',
    );
    if (!String(reliabilityRun?.run ?? '').includes('pnpm test:reliability')) {
      errors.push('quality-core.yml: reliability-tests must run pnpm test:reliability');
    }
    if (!hasEveryNeed(workflow.jobs.quality, ['reliability-tests'])) {
      errors.push('quality-core.yml: aggregate quality must depend on reliability-tests');
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
    if (quality?.with?.reliability_suite === false) {
      errors.push('release.yml: release quality must not disable reliability_suite');
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
