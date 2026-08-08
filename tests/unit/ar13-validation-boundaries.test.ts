import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const root = 'packages/core-service/src/validation.ts';
const modules = [
  'packages/core-service/src/validation/validation-model.ts',
  'packages/core-service/src/validation/validation-catalog.ts',
  'packages/core-service/src/validation/validation-rules.ts',
  'packages/core-service/src/validation/validation-rule-operations.ts',
  'packages/core-service/src/validation/validation-issue-operations.ts',
  'packages/core-service/src/validation/validation-todo-operations.ts',
  'packages/core-service/src/validation/validation-comment-operations.ts',
  'packages/core-service/src/validation/validation-service.ts',
] as const;

describe('AR-13 Validation boundaries', () => {
  it('keeps the public entry as a compatibility re-export', async () => {
    const source = await readFile(root, 'utf8');
    expect(source).toContain("export * from './validation/validation-model.js';");
    expect(source).toContain("export * from './validation/validation-service.js';");
  });

  it('separates catalog, rules, issue, todo and comment responsibilities', async () => {
    const sources = await Promise.all(modules.map((file) => readFile(file, 'utf8')));
    expect(sources[0]).toContain('export class ValidationServiceError');
    expect(sources[1]).toContain('export function catalog');
    expect(sources[2]).toContain('export function rules');
    expect(sources[3]).toContain('export class ValidationRuleOperations');
    expect(sources[4]).toContain('export class ValidationIssueOperations');
    expect(sources[5]).toContain('export class ValidationTodoOperations');
    expect(sources[6]).toContain('export class ValidationCommentOperations');
    expect(sources[7]).toContain('export class ValidationService');
  });
});
