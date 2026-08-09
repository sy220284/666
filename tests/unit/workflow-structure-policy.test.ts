import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  parseWorkflowDocument,
  validateWorkflowStructure,
} from '../../scripts/workflow-structure-policy.mjs';

describe('workflow structure policy', () => {
  it('parses reusable workflow inputs as typed YAML values', async () => {
    const source = await readFile('.github/workflows/quality.yml', 'utf8');
    const workflow = parseWorkflowDocument('quality.yml', source);
    expect(workflow.jobs.quality.uses).toBe('./.github/workflows/quality-core.yml');
    expect(workflow.jobs.quality.with.draft_mode).toBe(
      "${{ github.event.pull_request.draft && !contains(github.event.pull_request.body, 'full-validation-draft') }}",
    );
    expect(validateWorkflowStructure('quality.yml', source)).toEqual([]);
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
