import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseFoundationError } from '../../packages/core-service/src/database/index.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

async function expectScopeViolation(operation: Promise<unknown>, marker: string): Promise<void> {
  const error = await operation.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(DatabaseFoundationError);
  expect(error).toMatchObject({ code: 'DATABASE_WRITE_FAILED' });
  expect((error as Error).cause).toMatchObject({
    message: expect.stringContaining(marker),
  });
}

describe('M4-04 story todo and comment compound anchors', () => {
  it('accepts consistent anchors and rejects cross-chapter blocks on insert and update', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const secondDraft = await harness.drafts.open(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
      });
      const firstBlockId = seeded.draft.blocks[0]!.logicalBlockId;
      const secondBlockId = secondDraft.blocks[0]!.logicalBlockId;

      let catalog = await harness.validation.saveTodo(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sceneBeatId: null,
        logicalBlockId: firstBlockId,
        title: '复核第一章正文',
        status: 'open',
      });
      const todo = catalog.todos[0]!;
      expect(todo).toMatchObject({
        chapterId: seeded.chapter1.id,
        logicalBlockId: firstBlockId,
      });

      await expectScopeViolation(
        harness.validation.saveTodo(randomUUID(), {
          projectId: seeded.project.projectId,
          chapterId: seeded.chapter1.id,
          sceneBeatId: null,
          logicalBlockId: secondBlockId,
          title: '错误跨章待办',
          status: 'open',
        }),
        'STORY_TODO_BLOCK_CHAPTER_SCOPE_INVALID',
      );

      await expectScopeViolation(
        harness.validation.saveTodo(randomUUID(), {
          projectId: seeded.project.projectId,
          todoId: todo.todoId,
          chapterId: seeded.chapter1.id,
          sceneBeatId: null,
          logicalBlockId: secondBlockId,
          title: todo.title,
          status: todo.status,
        }),
        'STORY_TODO_BLOCK_CHAPTER_SCOPE_INVALID',
      );

      catalog = harness.validation.list({
        projectId: seeded.project.projectId,
        chapterId: null,
        includeClosed: true,
      });
      expect(catalog.todos).toHaveLength(1);
      expect(catalog.todos[0]).toMatchObject({
        todoId: todo.todoId,
        chapterId: seeded.chapter1.id,
        logicalBlockId: firstBlockId,
      });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('requires comment Version and block anchors to belong to the same chapter and source', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const secondDraft = await harness.drafts.open(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
      });
      const secondVersion = await harness.versions.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
        draftId: secondDraft.draftId,
        baseRevision: secondDraft.revision,
        title: '第二章来源',
      });
      const firstBlockId = seeded.version.blocks[0]!.logicalBlockId;
      const secondBlockId = secondVersion.blocks[0]!.logicalBlockId;

      let catalog = await harness.validation.addComment(randomUUID(), {
        projectId: seeded.project.projectId,
        issueId: null,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        logicalBlockId: firstBlockId,
        body: '同章同版本批注。',
      });
      expect(catalog.comments[0]).toMatchObject({
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        logicalBlockId: firstBlockId,
      });

      await expectScopeViolation(
        harness.validation.addComment(randomUUID(), {
          projectId: seeded.project.projectId,
          issueId: null,
          chapterId: seeded.chapter1.id,
          sourceVersionId: secondVersion.versionId,
          logicalBlockId: secondBlockId,
          body: '错误跨章版本批注。',
        }),
        'STORY_COMMENT_VERSION_CHAPTER_SCOPE_INVALID',
      );

      await expectScopeViolation(
        harness.validation.addComment(randomUUID(), {
          projectId: seeded.project.projectId,
          issueId: null,
          chapterId: seeded.chapter1.id,
          sourceVersionId: seeded.version.versionId,
          logicalBlockId: secondBlockId,
          body: '错误跨版本正文块批注。',
        }),
        'STORY_COMMENT_BLOCK_SOURCE_SCOPE_INVALID',
      );

      catalog = harness.validation.list({
        projectId: seeded.project.projectId,
        chapterId: null,
        includeClosed: true,
      });
      expect(catalog.comments).toHaveLength(1);
      expect(catalog.comments[0]).toMatchObject({
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        logicalBlockId: firstBlockId,
      });
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
