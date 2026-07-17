# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: m1-deferred-acceptance.spec.ts >> completes the M1-01 through M1-08 evidence-backed UI acceptance chain
- Location: tests/e2e/m1-deferred-acceptance.spec.ts:74:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('[data-draft-content]').locator('[data-block-type="paragraph"]')
Expected substring: "雨落在旧站台。"
Error: strict mode violation: locator('[data-draft-content]').locator('[data-block-type="paragraph"]') resolved to 2 elements:
    1) <p data-locked="false" data-source="manual" data-block-type="paragraph" data-client-block-id="cf0d253d-06b1-4afc-9479-6838d896ac65" data-logical-block-id="cf0d253d-06b1-4afc-9479-6838d896ac65" data-content-hash="1c22b1eb95cb390db98b92fa4647d5fe0b46b49686a228dfe0822ef5899fa5ac">雨落在旧站台。</p> aka getByText('雨落在旧站台。')
    2) <p data-locked="false" data-source="manual" data-block-type="paragraph" data-client-block-id="84be9470-6545-47f7-8a58-c0f242127dde" data-logical-block-id="84be9470-6545-47f7-8a58-c0f242127dde" data-content-hash="84ae9c309a980e32d8475b76738e09de3ecf1dd36aa156e23dab53cf37c1e462">…</p> aka getByRole('paragraph').filter({ hasText: /^$/ })

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('[data-draft-content]').locator('[data-block-type="paragraph"]')

```

# Test source

```ts
  56  |   const image = await page.screenshot({
  57  |     path: path.join(directory, name),
  58  |     animations: 'disabled',
  59  |     fullPage: false,
  60  |     scale: 'device',
  61  |   });
  62  |   expect(image.subarray(1, 4).toString('ascii')).toBe('PNG');
  63  |   expect(image.byteLength).toBeGreaterThan(10_000);
  64  | }
  65  | 
  66  | test.afterEach(async () => {
  67  |   await Promise.all(
  68  |     temporaryDirectories
  69  |       .splice(0)
  70  |       .map((directory) => rm(directory, { recursive: true, force: true })),
  71  |   );
  72  | });
  73  | 
  74  | test('completes the M1-01 through M1-08 evidence-backed UI acceptance chain', async () => {
  75  |   test.setTimeout(180_000);
  76  |   const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m1-acceptance-'));
  77  |   temporaryDirectories.push(userDataPath);
  78  |   const createParent = path.join(userDataPath, 'projects');
  79  |   const restoreParent = path.join(userDataPath, 'restored');
  80  |   const exportDirectory = path.join(userDataPath, 'exports');
  81  |   await Promise.all([
  82  |     mkdir(createParent, { recursive: true }),
  83  |     mkdir(restoreParent, { recursive: true }),
  84  |     mkdir(exportDirectory, { recursive: true }),
  85  |   ]);
  86  |   const environment = {
  87  |     WORLDFORGE_E2E_CREATE_PARENT: createParent,
  88  |     WORLDFORGE_E2E_RESTORE_PARENT: restoreParent,
  89  |     WORLDFORGE_E2E_RECOVERY_EXPORT_DIRECTORY: exportDirectory,
  90  |   };
  91  |   const workspacePath = path.join(createParent, 'M1验收项目.worldforge');
  92  | 
  93  |   const application = await launch(userDataPath, environment);
  94  |   let closed = false;
  95  |   try {
  96  |     const page = await application.firstWindow();
  97  |     await setViewport(application);
  98  |     await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
  99  | 
  100 |     await page.locator('[data-create-project]').click();
  101 |     await page.locator('[data-project-name]').fill('M1验收项目');
  102 |     await page.locator('[data-project-channel]').fill('长篇');
  103 |     await page.locator('[data-confirm-create-project]').click();
  104 |     await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
  105 |     await page.locator('[data-close-project]').click();
  106 |     await expect(page.locator('[data-recent-card]')).toHaveCount(1);
  107 |     await page.locator('[data-open-settings]').click();
  108 |     await page.locator('[data-default-mode]').selectOption('professional');
  109 |     await page.locator('[data-theme-id]').selectOption('theme-b');
  110 |     await page.locator('[data-theme-variant]').selectOption('eye-care');
  111 |     await page.locator('[data-save-settings]').click();
  112 |     await expect(page.locator('[data-settings-status]')).toHaveText('设置已保存到应用数据库');
  113 |     await capture(page, 'm1-01-settings-recent.png');
  114 |     await page.locator('[data-close-settings]').click();
  115 | 
  116 |     await page.locator('[data-open-recent]').click();
  117 |     await expect(page.locator('[data-active-project-path]')).toHaveText(workspacePath);
  118 |     await capture(page, 'm1-02-project-workspace.png');
  119 | 
  120 |     await page.locator('[data-create-volume]').click();
  121 |     await page.locator('[data-structure-title]').fill('第二卷');
  122 |     await page.locator('[data-save-structure]').click();
  123 |     await page.locator('[data-volume-title="第一卷"] [data-add-chapter]').click();
  124 |     await page.locator('[data-structure-title]').fill('第二章');
  125 |     await page.locator('[data-save-structure]').click();
  126 |     await page.locator('[data-chapter-title="第二章"] [data-edit-chapter]').click();
  127 |     await page.locator('[data-structure-status]').selectOption('writing');
  128 |     await page.locator('[data-structure-volume]').selectOption({ label: '第二卷' });
  129 |     await page.locator('input[name="targetWordMin"]').fill('2000');
  130 |     await page.locator('input[name="targetWordMax"]').fill('3000');
  131 |     await page.locator('[data-save-structure]').click();
  132 |     page.once('dialog', (dialog) => dialog.accept());
  133 |     await page.locator('[data-chapter-title="第二章"] [data-delete-chapter]').click();
  134 |     await page.locator('[data-open-trash]').click();
  135 |     await expect(page.locator('[data-trash-entry-id]')).toHaveCount(1);
  136 |     await page.locator('[data-restore-original]').click();
  137 |     await page.locator('[data-close-trash]').click();
  138 |     await expect(
  139 |       page.locator('[data-volume-title="第二卷"] [data-chapter-title="第二章"]'),
  140 |     ).toContainText('写作中 · 2000—3000 字');
  141 |     await capture(page, 'm1-03-volume-chapter-trash.png');
  142 | 
  143 |     await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
  144 |     const editor = page.locator('[data-draft-content]');
  145 |     const blocks = editor.locator(':scope > [data-block-type]');
  146 |     await editor.click();
  147 |     await page.keyboard.type('雨落在旧站台。');
  148 |     await page.keyboard.press('Enter');
  149 |     await page.keyboard.type('“谁在那里？”');
  150 |     await page.locator('[data-set-block-type="dialogue"]').click();
  151 |     await page.keyboard.press('End');
  152 |     await page.locator('[data-insert-separator]').click();
  153 |     await page.keyboard.type('第二节');
  154 |     await page.locator('[data-set-block-type="heading"]').click();
  155 |     await expect(blocks).toHaveCount(4);
> 156 |     await expect(editor.locator('[data-block-type="paragraph"]')).toContainText('雨落在旧站台。');
      |                                                                   ^ Error: expect(locator).toContainText(expected) failed
  157 |     await expect(editor.locator('[data-block-type="dialogue"]')).toContainText('谁在那里');
  158 |     await expect(editor.locator('[data-block-type="separator"]')).toHaveCount(1);
  159 |     await expect(editor.locator('[data-block-type="heading"]')).toContainText('第二节');
  160 |     await capture(page, 'm1-04-chinese-block-editor.png');
  161 | 
  162 |     await page.locator('[data-save-draft]').click();
  163 |     await expect(page.locator('[data-draft-state]')).toHaveText(/^已手动保存 · Revision \d+$/u);
  164 |     const revision = await page.evaluate(async () => {
  165 |       const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
  166 |         .worldforge;
  167 |       const active = await bridge.project.getActive();
  168 |       if (!active.ok || !active.data) return -1;
  169 |       const structure = await bridge.planning.listStructure(active.data.projectId);
  170 |       const chapter = structure.ok ? structure.data.volumes[0]?.chapters[0] : undefined;
  171 |       if (!chapter) return -1;
  172 |       const draft = await bridge.draft.open({
  173 |         projectId: active.data.projectId,
  174 |         chapterId: chapter.id,
  175 |       });
  176 |       return draft.ok ? draft.data.revision : -1;
  177 |     });
  178 |     expect(revision).toBeGreaterThan(0);
  179 |     await capture(page, 'm1-05-patch-revision.png');
  180 | 
  181 |     await page.locator('[data-draft-find]').fill('雨');
  182 |     await page.locator('[data-draft-find-next]').click();
  183 |     await expect(page.locator('[data-draft-find-status]')).toContainText('1');
  184 |     await expect(page.locator('[data-draft-character-count]')).not.toHaveText('0');
  185 |     await expect(page.locator('[data-draft-text-count]')).not.toHaveText('0');
  186 |     await capture(page, 'm1-06-autosave-stats-find.png');
  187 | 
  188 |     await page.locator('[data-create-version]').click();
  189 |     await page.locator('[data-version-title]').fill('M1验收版本');
  190 |     await page.locator('[data-version-label]').fill('阶段定稿');
  191 |     await page.locator('[data-version-description]').fill('延期验收固定版本');
  192 |     await page.locator('[data-confirm-version]').click();
  193 |     await expect(page.locator('[data-version-row]')).toHaveCount(1);
  194 |     await page.locator('[data-version-action="final"]').click();
  195 |     await expect(page.locator('[data-version-row]')).toContainText('定稿');
  196 |     await capture(page, 'm1-07-version-history.png');
  197 |     await page.locator('[data-close-versions]').click();
  198 | 
  199 |     await page.locator('[data-back-project]').click();
  200 |     await page.locator('[data-open-recovery]').click();
  201 |     await page.locator('[data-create-checkpoint]').click();
  202 |     await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {
  203 |       timeout: 10_000,
  204 |     });
  205 |     await page.locator('[data-export-recovery-version]').click();
  206 |     await expect(page.locator('[data-recovery-status]')).toContainText('已导出');
  207 |     await capture(page, 'm1-08-recovery-center.png');
  208 |     await page.locator('[data-close-recovery]').click();
  209 |     await page.locator('[data-close-project]').click();
  210 |     await closeGracefully(application);
  211 |     closed = true;
  212 |   } finally {
  213 |     if (!closed) await closeGracefully(application);
  214 |   }
  215 | 
  216 |   const projectDatabase = new DatabaseSync(path.join(workspacePath, 'project.sqlite'));
  217 |   projectDatabase
  218 |     .prepare(
  219 |       `INSERT INTO schema_migrations(version, name, checksum, applied_at, app_version)
  220 |        VALUES(99, 'm1-acceptance-future', 'm1-acceptance-future-checksum', ?, '9.0.0')`,
  221 |     )
  222 |     .run('2026-07-17T02:30:00.000Z');
  223 |   projectDatabase.close();
  224 | 
  225 |   const readOnlyApplication = await launch(userDataPath, environment);
  226 |   try {
  227 |     const page = await readOnlyApplication.firstWindow();
  228 |     await setViewport(readOnlyApplication);
  229 |     await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
  230 |     await page.locator('[data-open-recent]').click();
  231 |     await expect(page.locator('body')).toHaveAttribute('data-project-state', 'read-only');
  232 |     await expect(page.locator('[data-active-project-readonly]')).toContainText('future-schema');
  233 |     await expect(page.locator('[data-move-project]')).toBeDisabled();
  234 |     await capture(page, 'm1-02-read-only.png');
  235 |     await page.locator('[data-open-recovery]').click();
  236 |     await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1);
  237 |     await expect(page.locator('[data-create-checkpoint]')).toBeDisabled();
  238 |     await capture(page, 'm1-08-readonly-recovery.png');
  239 |   } finally {
  240 |     await closeGracefully(readOnlyApplication);
  241 |   }
  242 | });
  243 | 
```