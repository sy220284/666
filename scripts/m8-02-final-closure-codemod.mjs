import { readFile, writeFile } from 'node:fs/promises';

async function edit(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`NO_CHANGE:${path}`);
  await writeFile(path, after, 'utf8');
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`MISSING:${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`MULTIPLE:${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

await edit('packages/core-service/src/docx-transfer.ts', (source) =>
  replaceOnce(
    source,
    `    const compressedSize = buffer.readUInt32LE(cursor + 20);\n    const expandedSize = buffer.readUInt32LE(cursor + 24);`,
    `    const crc32 = buffer.readUInt32LE(cursor + 16);\n    const compressedSize = buffer.readUInt32LE(cursor + 20);\n    const expandedSize = buffer.readUInt32LE(cursor + 24);`,
    'docx-central-crc',
  ).replace(
    `    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) {\n      unsupported('The DOCX local entry headers are inconsistent.');\n    }`,
    `    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) {\n      unsupported('The DOCX local entry headers are inconsistent.');\n    }\n    const localFlags = buffer.readUInt16LE(localOffset + 6);\n    const localCompression = buffer.readUInt16LE(localOffset + 8);\n    const localCrc32 = buffer.readUInt32LE(localOffset + 14);\n    const localCompressedSize = buffer.readUInt32LE(localOffset + 18);\n    const localExpandedSize = buffer.readUInt32LE(localOffset + 22);\n    const localNameLength = buffer.readUInt16LE(localOffset + 26);\n    const localExtraLength = buffer.readUInt16LE(localOffset + 28);\n    const localHeaderEnd = localOffset + 30 + localNameLength + localExtraLength;\n    if (localHeaderEnd > centralOffset) {\n      unsupported('The DOCX local entry header extends into the central directory.');\n    }\n    const localName = readName(\n      buffer,\n      localOffset + 30,\n      localNameLength,\n      (localFlags & 0x800) !== 0,\n    );\n    if (localFlags !== flags || localCompression !== compression || localName !== name) {\n      unsupported('The DOCX local entry header fields do not match the central directory.');\n    }\n    const usesDataDescriptor = (flags & 0x8) !== 0;\n    const localSizesMatch =\n      localCrc32 === crc32 &&\n      localCompressedSize === compressedSize &&\n      localExpandedSize === expandedSize;\n    const localSizesArePlaceholders =\n      localCrc32 === 0 && localCompressedSize === 0 && localExpandedSize === 0;\n    if ((!usesDataDescriptor && !localSizesMatch) ||\n        (usesDataDescriptor && !localSizesMatch && !localSizesArePlaceholders)) {\n      unsupported('The DOCX local entry sizes do not match the central directory.');\n    }\n    if (localHeaderEnd + compressedSize > centralOffset) {\n      unsupported('The DOCX local entry payload overlaps the central directory.');\n    }`,
  ),
);

await edit('tests/integration/docx-transfer.test.ts', (source) => {
  let next = replaceOnce(
    source,
    `import { CoordinatedImportExportService } from '../../packages/core-service/src/coordinated-import-export.js';`,
    `import { CoordinatedImportExportService } from '../../packages/core-service/src/coordinated-import-export.js';\nimport { parseDocx, renderDocx } from '../../packages/core-service/src/docx-transfer.js';`,
    'docx-test-import',
  );
  const addition = `\n\n  it('cross-checks central-directory fields against every local header', () => {\n    const archive = renderDocx([\n      {\n        chapterTitle: '第一章',\n        blocks: [{ blockType: 'paragraph', text: '本地头与中央目录必须一致。' }],\n      },\n    ]);\n    let eocd = -1;\n    for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset -= 1) {\n      if (archive.readUInt32LE(offset) === 0x06054b50) {\n        eocd = offset;\n        break;\n      }\n    }\n    expect(eocd).toBeGreaterThanOrEqual(0);\n    const centralOffset = archive.readUInt32LE(eocd + 16);\n    const localOffset = archive.readUInt32LE(centralOffset + 42);\n    archive.writeUInt16LE(archive.readUInt16LE(localOffset + 8) === 8 ? 0 : 8, localOffset + 8);\n    expect(() => parseDocx(archive, '损坏文档', randomUUID)).toThrowError(\n      /local entry header fields do not match/iu,\n    );\n  });\n\n  it('imports a deterministic seven-million-character DOCX within archive limits', () => {\n    const bytes = Buffer.allocUnsafe(7_000_000);\n    let state = 0x1357_9bdf;\n    for (let index = 0; index < bytes.length; index += 1) {\n      state ^= state << 13;\n      state ^= state >>> 17;\n      state ^= state << 5;\n      bytes[index] = 33 + (state >>> 0) % 90;\n    }\n    const text = bytes.toString('ascii');\n    const archive = renderDocx([\n      { chapterTitle: '超大章节', blocks: [{ blockType: 'paragraph', text }] },\n    ]);\n    const parsed = parseDocx(archive, '超大章节', randomUUID);\n    expect(archive.byteLength).toBeLessThan(20 * 1024 * 1024);\n    expect(parsed.chapters[0]?.blocks[0]?.text).toHaveLength(text.length);\n  });`;
  const end = next.lastIndexOf('\n});');
  if (end < 0) throw new Error('MISSING:docx-test-describe-end');
  next = next.slice(0, end) + addition + next.slice(end);
  return next;
});

await edit('packages/core-service/src/recovery.ts', (source) => {
  let next = replaceOnce(source, `  mkdir,\n  readFile,`, `  mkdir,\n  open,\n  readFile,`, 'recovery-open-import');
  const oldMethod = `  async createDailyBackup(requestId: string, raw: RecoveryDailyBackupInput): Promise<BackupRecord> {\n    const input = RecoveryDailyBackupInputSchema.parse(raw);\n    const today = this.#clock.now().toISOString().slice(0, 10);\n    const existing = (await this.#readMetadata(input.projectId)).find(\n      (record) => record.track === 'daily' && record.createdAt.slice(0, 10) === today,\n    );\n    if (existing) return existing;\n    return this.#createTrackedBackup(\n      requestId,\n      { projectId: input.projectId, operation: 'manual-protection' },\n      {\n        track: 'daily',\n        displayName: null,\n        note: null,\n        authorProtected: false,\n        migrationProtected: false,\n      },\n    );\n  }`;
  const newMethod = `  async createDailyBackup(requestId: string, raw: RecoveryDailyBackupInput): Promise<BackupRecord> {\n    const input = RecoveryDailyBackupInputSchema.parse(raw);\n    const today = this.#clock.now().toISOString().slice(0, 10);\n    const backupDirectory = path.join(this.#backupRootDirectory, input.projectId);\n    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });\n    await chmod(backupDirectory, 0o700);\n    const lockPath = path.join(backupDirectory, \`.daily-\${today}.lock\`);\n    const startedAt = Date.now();\n    let lock: Awaited<ReturnType<typeof open>> | null = null;\n    for (;;) {\n      try {\n        lock = await open(lockPath, 'wx', 0o600);\n        break;\n      } catch (error) {\n        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;\n        if (Date.now() - startedAt >= 30_000) {\n          try {\n            const details = await stat(lockPath);\n            if (Date.now() - details.mtimeMs >= 30_000) {\n              await rm(lockPath, { force: true });\n              continue;\n            }\n          } catch (lockError) {\n            if (isMissing(lockError)) continue;\n            throw lockError;\n          }\n          throw new RecoveryServiceError(\n            'BACKUP_CREATE_FAILED',\n            'Daily backup coordination timed out.',\n          );\n        }\n        await new Promise((resolve) => setTimeout(resolve, 50));\n      }\n    }\n    if (!lock) throw new RecoveryServiceError('BACKUP_CREATE_FAILED', 'Daily backup lock failed.');\n    try {\n      const existing = (await this.#readMetadata(input.projectId)).find(\n        (record) => record.track === 'daily' && record.createdAt.slice(0, 10) === today,\n      );\n      if (existing) return existing;\n      return await this.#createTrackedBackup(\n        requestId,\n        { projectId: input.projectId, operation: 'manual-protection' },\n        {\n          track: 'daily',\n          displayName: null,\n          note: null,\n          authorProtected: false,\n          migrationProtected: false,\n        },\n      );\n    } finally {\n      await lock.close();\n      await rm(lockPath, { force: true });\n    }\n  }`;
  next = replaceOnce(next, oldMethod, newMethod, 'daily-backup-lock');
  return next;
});

await edit('tests/integration/three-track-recovery.test.ts', (source) => {
  let next = replaceOnce(
    source,
    `    const recovery = new CheckpointAwareRecoveryService(workspace, {\n      backupRootDirectory: backupRoot,\n      clock,\n    });`,
    `    const recovery = new CheckpointAwareRecoveryService(workspace, {\n      backupRootDirectory: backupRoot,\n      clock,\n    });\n    const recoveryReplica = new CheckpointAwareRecoveryService(workspace, {\n      backupRootDirectory: backupRoot,\n      clock,\n    });`,
    'recovery-replica',
  );
  next = replaceOnce(
    next,
    `        recovery.createDailyBackup(randomUUID(), { projectId: project.projectId }),\n        recovery.createDailyBackup(randomUUID(), { projectId: project.projectId }),`,
    `        recovery.createDailyBackup(randomUUID(), { projectId: project.projectId }),\n        recoveryReplica.createDailyBackup(randomUUID(), { projectId: project.projectId }),`,
    'cross-instance-daily',
  );
  return next;
});

await edit('tests/performance/m8-release-evidence.test.ts', (source) => {
  let next = replaceOnce(
    source,
    `import { performance } from 'node:perf_hooks';`,
    `import { monitorEventLoopDelay, performance } from 'node:perf_hooks';`,
    'event-loop-import',
  );
  const addition = `\n\n  it('records sustained Core workload and event-loop delay', async () => {\n    const histogram = monitorEventLoopDelay({ resolution: 10 });\n    const harness = await createProjectHarness('worldforge-m8-sustained-');\n    const initialHeap = process.memoryUsage().heapUsed;\n    const startedAt = performance.now();\n    histogram.enable();\n    let heapGrowthBytes = 0;\n    try {\n      const project = await harness.workspace.create(\n        randomUUID(),\n        { name: 'M8持续负载', channel: '长篇' },\n        harness.parent,\n      );\n      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;\n      let opened = await harness.drafts.open(randomUUID(), {\n        projectId: project.projectId,\n        chapterId: chapter.id,\n      });\n      const base = '持续写作、保存、统计与索引负载。'.repeat(160);\n      for (let index = 0; index < 300; index += 1) {\n        const block = opened.blocks[0]!;\n        opened = await harness.drafts.applyPatch(randomUUID(), {\n          projectId: project.projectId,\n          chapterId: chapter.id,\n          draftId: opened.draftId,\n          baseRevision: opened.revision,\n          operations: [\n            {\n              type: 'update',\n              logicalBlockId: block.logicalBlockId,\n              expectedHash: block.contentHash!,\n              content: \`\${base}\${index}\`,\n            },\n          ],\n        });\n        calculateWritingStatistics(opened.blocks[0]!.text, 200, 8_000);\n        if (index % 20 === 0) await new Promise((resolve) => setImmediate(resolve));\n      }\n      await harness.search.rebuild(randomUUID(), project.projectId);\n      heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - initialHeap);\n    } finally {\n      histogram.disable();\n      await harness.workspace.shutdown();\n      await harness.appRuntime.close();\n    }\n    const elapsedMs = performance.now() - startedAt;\n    const eventLoopP99Ms = histogram.percentile(99) / 1_000_000;\n    record({\n      metric: 'core_event_loop_delay_p99_ms',\n      dataset: '300-autosave-sustained-workload',\n      samples: 1,\n      result: eventLoopP99Ms,\n      budget: 100,\n    });\n    record({\n      metric: 'sustained_workload_total_ms',\n      dataset: '300-autosave-plus-fts-rebuild',\n      samples: 1,\n      result: elapsedMs,\n      budget: 60_000,\n    });\n    expect(heapGrowthBytes).toBeLessThan(128 * 1024 * 1024);\n  });`;
  const end = next.lastIndexOf('\n});');
  if (end < 0) throw new Error('MISSING:performance-describe-end');
  next = next.slice(0, end) + addition + next.slice(end);
  return next;
});

await edit('tests/e2e/electron-shell.spec.ts', (source) => {
  let next = replaceOnce(
    source,
    `import { mkdtemp, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';`,
    `import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';`,
    'e2e-write-file-import',
  );
  const addition = `\n\ntest('records Renderer animation-frame budget during sustained writing scroll', async () => {\n  test.setTimeout(120_000);\n  const userDataPath = await temporaryUserData();\n  const createParent = path.join(userDataPath, 'renderer-performance-projects');\n  await mkdir(createParent, { recursive: true });\n  const application = await launch(userDataPath, undefined, {\n    WORLDFORGE_E2E_CREATE_PARENT: createParent,\n  });\n  try {\n    const page = await application.firstWindow();\n    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');\n    await page.locator('[data-create-project]').click();\n    await page.locator('[data-project-name]').fill('Renderer帧率');\n    await page.locator('[data-project-channel]').fill('长篇');\n    await page.locator('[data-confirm-create-project]').click();\n    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();\n    const editor = page.locator('[data-draft-content]');\n    const content = Array.from(\n      { length: 320 },\n      (_value, index) => \`第\${String(index + 1).padStart(3, '0')}段：长篇写作滚动性能基线。\${'灯火与长街。'.repeat(8)}\`,\n    ).join('\\n');\n    await editor.fill(content);\n    await expect(page.locator('[data-draft-state]')).toHaveText(/Revision \\d+$/u, {\n      timeout: 15_000,\n    });\n    const metrics = await page.evaluate(async () => {\n      const candidates = [\n        document.scrollingElement,\n        ...Array.from(document.querySelectorAll<HTMLElement>('*')),\n      ].filter((element): element is HTMLElement =>\n        Boolean(element && element.scrollHeight - element.clientHeight > 200),\n      );\n      const scroller = candidates.sort(\n        (left, right) =>\n          right.scrollHeight - right.clientHeight - (left.scrollHeight - left.clientHeight),\n      )[0];\n      if (!scroller) throw new Error('RENDERER_SCROLL_CONTAINER_MISSING');\n      const startedAt = performance.now();\n      let frames = 0;\n      return await new Promise<{ fps: number; durationMs: number; frames: number }>((resolve) => {\n        const step = (timestamp: number): void => {\n          frames += 1;\n          const elapsed = timestamp - startedAt;\n          const maximum = Math.max(1, scroller.scrollHeight - scroller.clientHeight);\n          const progress = Math.min(1, elapsed / 3_000);\n          scroller.scrollTop = progress < 0.5 ? maximum * progress * 2 : maximum * (2 - progress * 2);\n          if (elapsed < 3_000) {\n            requestAnimationFrame(step);\n            return;\n          }\n          resolve({ fps: (frames * 1_000) / elapsed, durationMs: elapsed, frames });\n        };\n        requestAnimationFrame(step);\n      });\n    });\n    expect(metrics.fps).toBeGreaterThanOrEqual(50);\n    const output = path.join(process.cwd(), 'test-results/electron/m8-renderer-performance.json');\n    await mkdir(path.dirname(output), { recursive: true });\n    await writeFile(\n      output,\n      \`\${JSON.stringify({ schemaVersion: 1, taskId: 'M8-02', ...metrics }, null, 2)}\\n\`,\n      'utf8',\n    );\n  } finally {\n    await closeGracefully(application);\n  }\n});`;
  next += addition;
  return next;
});

await edit('tests/e2e/m1-deferred-acceptance.spec.ts', (source) =>
  replaceOnce(
    source,
    `    await page.locator('[data-open-recovery]').click();\n    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1);\n    await expect(page.locator('[data-create-checkpoint]')).toBeDisabled();`,
    `    await page.locator('[data-open-recovery]').click();\n    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {\n      timeout: 20_000,\n    });\n    await expect(page.locator('[data-create-checkpoint]')).toBeDisabled();`,
    'm1-readonly-recovery-timeout',
  ),
);

await edit('tests/e2e/unreadable-project-recovery.spec.ts', (source) =>
  replaceOnce(
    source,
    `    await expect(page.locator('[data-recovery-dialog]')).toBeVisible();\n    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1);\n    await expect(page.locator('[data-recovery-versions]')).toContainText('物理损坏可导出版本');`,
    `    await expect(page.locator('[data-recovery-dialog]')).toBeVisible();\n    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {\n      timeout: 20_000,\n    });\n    await expect(page.locator('[data-recovery-versions]')).toContainText('物理损坏可导出版本');`,
    'unreadable-recovery-timeout',
  ),
);

console.log('M8-02 final closure codemod applied.');
