import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  parseWorkflowDocument,
  validateWorkflowStructure,
} from '../../scripts/workflow-structure-policy.mjs';

describe('workflow structure policy', () => {
  it('parses the quality workflow as one final server-visible authority', async () => {
    const source = await readFile('.github/workflows/quality.yml', 'utf8');
    const workflow = parseWorkflowDocument('quality.yml', source);
    expect(workflow.jobs['quality-core'].uses).toBe('./.github/workflows/quality-core.yml');
    expect(workflow.jobs['quality-core'].with.draft_mode).toBe(
      "${{ github.event.pull_request.draft && !contains(github.event.pull_request.body || '', '<!-- full-validation-draft -->') }}",
    );
    expect(workflow.jobs['quality-core'].with.reliability_suite).toBe(
      "${{ needs.route.outputs.reliability == 'true' }}",
    );
    expect(workflow.jobs['quality-core'].with.linux_platform_experience).toBe(
      "${{ needs.route.outputs.platform_experience == 'true' }}",
    );
    expect(workflow.jobs.quality.name).toBe('quality / quality');
    expect(workflow.jobs.quality.needs).toEqual(
      expect.arrayContaining([
        'route',
        'quality-core',
        'windows-native-ime',
        'platform-experience-macos',
        'release-audit',
      ]),
    );
    const routeScript = workflow.jobs.route.steps.find(
      (step: { name?: string }) =>
        step.name === 'Determine PR quality route from unified risk plan',
    ).run;
    expect(routeScript).toContain('ci-risk-policy.mjs full-suite');
    expect(routeScript).toContain('ci-risk-policy.mjs package-smoke');
    expect(routeScript).toContain('ci-risk-policy.mjs toolchain-export');
    expect(routeScript).toContain('ci-risk-policy.mjs reliability');
    expect(routeScript).toContain('ci-risk-policy.mjs windows-ime');
    expect(routeScript).toContain('ci-risk-policy.mjs platform-experience');
    expect(routeScript).toContain('ci-risk-policy.mjs release-audit');
    expect(workflow.jobs['windows-native-ime'].needs).toBe('route');
    expect(workflow.jobs['windows-native-ime'].if).toContain(
      "needs.route.outputs.windows_ime == 'true'",
    );
    expect(workflow.jobs['windows-native-ime'].if).toContain(
      "needs.route.outputs.platform_experience == 'true'",
    );
    expect(source).not.toContain('chinese-experience-verification-closure');
    const evidenceScan = workflow.jobs['release-audit'].steps.find(
      (step: { name?: string }) => step.name === 'Scan effective Verified Evidence',
    );
    expect(evidenceScan.env.TASK_BASE_REF).toBe('${{ github.event.pull_request.base.sha }}');
    expect(validateWorkflowStructure('quality.yml', source)).toEqual([]);
  });

  it('keeps Reliability enabled and Linux platform reuse disabled by default in Quality Core', async () => {
    const source = await readFile('.github/workflows/quality-core.yml', 'utf8');
    const workflow = parseWorkflowDocument('quality-core.yml', source);
    expect(workflow.on.workflow_call.inputs.reliability_suite).toMatchObject({
      type: 'boolean',
      default: true,
    });
    expect(workflow.on.workflow_call.inputs.linux_platform_experience).toMatchObject({
      type: 'boolean',
      default: false,
    });
    expect(workflow.jobs['reliability-tests'].if).toContain('inputs.reliability_suite');
    expect(
      workflow.jobs['reliability-tests'].steps.find(
        (step: { name?: string }) => step.name === 'Run reliability invariants',
      ).run,
    ).toContain('pnpm test:reliability');
    expect(
      workflow.jobs['product-tests'].steps.find(
        (step: { name?: string }) => step.name === 'Run product tests with coverage',
      ).run,
    ).toContain('vitest.coverage.config.ts');
    expect(workflow.jobs.tests).toBeUndefined();
    expect(workflow.jobs.coverage).toBeUndefined();
    expect(workflow.jobs.build).toBeUndefined();
    expect(workflow.jobs.quality.needs).toContain('reliability-tests');
    expect(validateWorkflowStructure('quality-core.yml', source)).toEqual([]);
  });

  it('rejects a quality workflow that can scan the current runtime as historical', async () => {
    const source = await readFile('.github/workflows/quality.yml', 'utf8');
    const unsafe = source.replace(
      '          TASK_BASE_REF: ${{ github.event.pull_request.base.sha }}\n',
      '',
    );
    expect(validateWorkflowStructure('quality.yml', unsafe)).toContain(
      'quality.yml: Verified Evidence scan must receive the current pull request base SHA as TASK_BASE_REF',
    );
  });

  it('rejects a quality workflow that bypasses the package risk route', async () => {
    const source = await readFile('.github/workflows/quality.yml', 'utf8');
    const unsafe = source.replace(
      'ci-risk-policy.mjs package-smoke',
      'ci-risk-policy.mjs full-suite',
    );
    expect(validateWorkflowStructure('quality.yml', unsafe)).toContain(
      'quality.yml: unified risk routing must invoke ci-risk-policy.mjs package-smoke',
    );
  });

  it('rejects a quality workflow that bypasses the reliability risk route', async () => {
    const source = await readFile('.github/workflows/quality.yml', 'utf8');
    const unsafe = source.replace(
      'ci-risk-policy.mjs reliability',
      'ci-risk-policy.mjs full-suite',
    );
    expect(validateWorkflowStructure('quality.yml', unsafe)).toContain(
      'quality.yml: unified risk routing must invoke ci-risk-policy.mjs reliability',
    );
  });

  it('rejects a quality workflow that bypasses release-audit routing', async () => {
    const source = await readFile('.github/workflows/quality.yml', 'utf8');
    const unsafe = source.replace(
      'ci-risk-policy.mjs release-audit',
      'ci-risk-policy.mjs full-suite',
    );
    expect(validateWorkflowStructure('quality.yml', unsafe)).toContain(
      'quality.yml: unified risk routing must invoke ci-risk-policy.mjs release-audit',
    );
  });

  it('rejects task-specific Windows IME routing', async () => {
    const source = await readFile('.github/workflows/quality.yml', 'utf8');
    const unsafe = `${source}\n# chinese-experience-verification-closure\n`;
    expect(validateWorkflowStructure('quality.yml', unsafe)).toContain(
      'quality.yml: Windows IME must not depend on the retired task-specific marker',
    );
  });

  it('rejects merged main static Quality reruns and branch hygiene in Main Verification', async () => {
    const source = await readFile('.github/workflows/main-verification.yml', 'utf8');
    expect(validateWorkflowStructure('main-verification.yml', source)).toEqual([]);
    const withStatic = source.replace(
      'jobs:\n',
      'jobs:\n  quality:\n    uses: ./.github/workflows/quality-core.yml\n',
    );
    expect(validateWorkflowStructure('main-verification.yml', withStatic)).toContain(
      'main-verification.yml: merged main must not rerun PR static Quality',
    );
  });

  it('rejects mutable action references and credential-persisting checkout steps', () => {
    const source = [
      'name: Unsafe',
      'on:',
      '  workflow_dispatch:',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-24.04',
      '    steps:',
      '      - uses: actions/checkout@v6',
    ].join('\n');
    const errors = validateWorkflowStructure('unsafe.yml', source);
    expect(errors).toContain(
      'unsafe.yml: actions/checkout must use immutable SHA de0fac2e4500dabe0009e67214ff5f5447ce83dd',
    );
    expect(errors).toContain('unsafe.yml: every checkout must set persist-credentials: false');
  });
});
