import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const validationRoot = 'packages/core-service/src/validation';

async function source(file: string): Promise<string> {
  return readFile(`${validationRoot}/${file}`, 'utf8');
}

function lineCount(value: string): number {
  return value.trimEnd().split('\n').length;
}

describe('AR-13 Validation review boundaries', () => {
  it('uses the review facade in the active Core service container', async () => {
    const container = await readFile(
      'packages/core-service/src/utility-generation-service-container.ts',
      'utf8',
    );

    expect(container).toContain('ValidationReviewService');
    expect(container).not.toContain("from './validation.js'");
    expect(container).not.toContain('new ValidationService(');
  });

  it('separates Issue, Todo and Comment mutation responsibilities', async () => {
    const [facade, issue, todo, comment] = await Promise.all([
      source('validation-review-service.ts'),
      source('validation-issue-service.ts'),
      source('validation-todo-service.ts'),
      source('validation-comment-service.ts'),
    ]);

    expect(facade).toContain('ValidationIssueService');
    expect(facade).toContain('ValidationTodoService');
    expect(facade).toContain('ValidationCommentService');
    expect(issue).toContain('ValidationUpdateIssueInputSchema');
    expect(issue).not.toContain('StoryTodoSaveInputSchema');
    expect(todo).toContain('ValidationCreateTodoInputSchema');
    expect(todo).toContain('StoryTodoSaveInputSchema');
    expect(todo).not.toContain('StoryCommentAddInputSchema');
    expect(comment).toContain('StoryCommentAddInputSchema');
    expect(comment).toContain('StoryCommentResolveInputSchema');
    expect(comment).not.toContain('ValidationUpdateIssueInputSchema');
  });

  it('keeps review services below the frozen module budgets', async () => {
    const budgets = {
      'validation-review-service.ts': 90,
      'validation-issue-service.ts': 100,
      'validation-todo-service.ts': 160,
      'validation-comment-service.ts': 150,
      'validation-review-catalog.ts': 300,
    } as const;

    for (const [file, budget] of Object.entries(budgets)) {
      expect(lineCount(await source(file))).toBeLessThanOrEqual(budget);
    }
  });
});
