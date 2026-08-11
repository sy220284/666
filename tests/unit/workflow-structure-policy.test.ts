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
    expect(workflow.jobs.quality.name).toBe('quality / quality');
    expect(workflow.jobs.quality.needs).toEqual(
      expect.arrayContaining(['quality-core', 'release-audit', 'package-smoke-gate']),
    );
    const routeScript = workflow.jobs.route.steps.find(
      (step: { name?: string }) =>
        step.name === 'Determine PR quality route from unified risk plan',
    ).run;
    expect(routeScript).toContain('ci-risk-policy.mjs full-suite');
    expect(routeScript).toContain('ci-risk-policy.mjs package-smoke');
    expect(routeScript).toContain('ci-risk-policy.mjs toolchain-export');
    expect(routeScript).toContain('ci-risk-policy.mjs windows-ime');
    expect(workflow.jobs['windows-native-ime'].needs).toBe('route');
    expect(workflow.jobs['windows-native-ime'].if).toContain(
      "needs.route.outputs.windows_ime == 'true'",
    );
    expect(source).not.toContain('chinese-experience-verification-closure');
    const evidenceScan = workflow.jobs['release-audit'].steps.find(
      (step: { name?: string }) => step.name === 'Scan effective Verified Evidence',
    );
    expect(evidenceScan.env.TASK_BASE_REF).toBe('${{ github.event.pull_request.base.sha }}');
    expect(validateWorkflowStructure('quality.yml', source)).toEqual([]);
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
    const unsafe = source.replace('ci-risk-policy.mjs package-smoke', 'ci-risk-policy.mjs full-suite');
    expect(validateWorkflowStructure('quality.yml', unsafe)).toContain(
      'quality.yml: unified risk routing must invoke ci-risk-policy.mjs package-smoke',
    );
  });

  it('rejects task-specific Windows IME routing', async () => {
    const source = await readFile('.github/workflows/quality.yml', 'utf8');
    const unsafe = `${source}\n# chinese-experience-verification-closure\n`;
    expect(validateWorkflowStructure('quality.yml', unsafe)).toContain(
      'quality.yml: Windows IME must not depend on the retired task-specific marker',
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
