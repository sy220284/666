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
      (step: { name?: string }) => step.name === 'Determine PR quality route',
    ).run;
    expect(routeScript).toContain(
      '.github/workflows/release.yml|.github/workflows/quality.yml|.github/workflows/quality-core.yml)',
    );
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

  it('rejects a quality workflow that skips package smoke when its orchestration changes', async () => {
    const source = await readFile('.github/workflows/quality.yml', 'utf8');
    const unsafe = source.replace(
      '|.github/workflows/release.yml|.github/workflows/quality.yml|.github/workflows/quality-core.yml)',
      '|.github/workflows/release.yml|.github/workflows/quality-core.yml)',
    );
    expect(validateWorkflowStructure('quality.yml', unsafe)).toContain(
      'quality.yml: package smoke routing must include release.yml, quality.yml and quality-core.yml',
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
      'unsafe.yml: actions/checkout must use immutable SHA d23441a48e516b6c34aea4fa41551a30e30af803',
    );
    expect(errors).toContain('unsafe.yml: every checkout must set persist-credentials: false');
  });
});
