import { readFile, writeFile } from 'node:fs/promises';

const path = 'tests/e2e/electron-shell.spec.ts';
const before = await readFile(path, 'utf8');
const needle = `    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
    const editor = page.locator('[data-draft-content]');
    const content = Array.from(
      { length: 320 },
      (_value, index) => \`第\${String(index + 1).padStart(3, '0')}段：长篇写作滚动性能基线。\${'灯火与长街。'.repeat(8)}\`,
    ).join('\\n');
    await editor.fill(content);
    await expect(page.locator('[data-draft-state]')).toHaveText(/Revision \\d+$/u, {
      timeout: 15_000,
    });`;
const replacement = `    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open', {
      timeout: 20_000,
    });
    const seeded = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge }).worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) throw new Error('RENDERER_PERF_ACTIVE_PROJECT_MISSING');
      const structure = await bridge.planning.listStructure(active.data.projectId);
      if (!structure.ok) throw new Error(structure.error.code);
      const chapter = structure.data.volumes[0]?.chapters[0];
      if (!chapter) throw new Error('RENDERER_PERF_CHAPTER_MISSING');
      const opened = await bridge.draft.open({
        projectId: active.data.projectId,
        chapterId: chapter.id,
      });
      if (!opened.ok) throw new Error(opened.error.code);
      const initial = opened.data.blocks[0];
      if (!initial?.contentHash) throw new Error('RENDERER_PERF_INITIAL_BLOCK_MISSING');
      const paragraphs = Array.from(
        { length: 96 },
        (_value, index) =>
          \`第\${String(index + 1).padStart(3, '0')}段：长篇写作滚动性能基线。\${'灯火与长街。'.repeat(8)}\`,
      );
      const operations: Parameters<WorldforgeBridge['draft']['applyPatch']>[0]['operations'] = [
        {
          type: 'update',
          logicalBlockId: initial.logicalBlockId,
          expectedHash: initial.contentHash,
          content: paragraphs[0]!,
        },
        ...paragraphs.slice(1).map((content) => ({
          type: 'insert' as const,
          afterLogicalBlockId: initial.logicalBlockId,
          block: { blockType: 'paragraph' as const, content, attributes: {} },
        })),
      ];
      const saved = await bridge.draft.applyPatch({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: opened.data.draftId,
        baseRevision: opened.data.revision,
        operations,
      });
      if (!saved.ok) throw new Error(saved.error.code);
      return { blockCount: saved.data.blocks.length };
    });
    expect(seeded).toEqual({ blockCount: 96 });
    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
    const editor = page.locator('[data-draft-content]');
    await expect(editor.locator(':scope > [data-block-type]')).toHaveCount(96, {
      timeout: 20_000,
    });`;
const first = before.indexOf(needle);
if (first < 0) throw new Error('MISSING:renderer-fps-ui-fixture');
if (before.indexOf(needle, first + needle.length) >= 0) {
  throw new Error('MULTIPLE:renderer-fps-ui-fixture');
}
const after = before.slice(0, first) + replacement + before.slice(first + needle.length);
await writeFile(path, after, 'utf8');
console.log('M8-02 Renderer FPS fixture waits for project open and seeds 96 blocks through Core.');
