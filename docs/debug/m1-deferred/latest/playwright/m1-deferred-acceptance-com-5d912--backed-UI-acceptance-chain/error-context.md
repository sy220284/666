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

Locator: locator('[data-draft-content]').locator('[data-block-type="dialogue"]')
Expected substring: "谁在那里"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('[data-draft-content]').locator('[data-block-type="dialogue"]')

```

```yaml
- banner:
  - text: W
  - strong: WorldForge
  - text: 本地写作工作台 Core
  - strong: healthy
  - button "新建项目" [disabled]
  - button "打开项目" [disabled]
  - button "通用设置"
  - button "浮层边界"
  - button "对话框"
  - button "重启 Core"
- complementary:
  - text: 验证导航
  - strong: 应用首页
  - region "卷章目录":
    - text: PROJECT STRUCTURE
    - strong: 卷章目录
    - button "新建卷"
    - status: 结构已同步。
    - strong: 第一卷
    - text: 待规划 · 1 章
    - button "+章"
    - button "编"
    - button "↑" [disabled]
    - button "↓"
    - button "删"
    - list:
      - listitem:
        - button "§ 第一章" [pressed]
        - text: 待规划 · 未设目标
        - button "编"
        - button "↑" [disabled]
        - button "↓" [disabled]
        - button "删"
    - strong: 第二卷
    - text: 待规划 · 1 章
    - button "+章"
    - button "编"
    - button "↑"
    - button "↓" [disabled]
    - button "删"
    - list:
      - listitem:
        - button "§ 第二章"
        - text: 写作中 · 2000—3000 字
        - button "编"
        - button "↑" [disabled]
        - button "↓" [disabled]
        - button "删"
    - button "废纸篓"
- main:
  - paragraph: LOCAL FIRST · APPLICATION HOME
  - heading "M1验收项目 · 第一章" [level=1]
  - text: 活动 Draft
  - article:
    - paragraph: DRAFT · PROJECT.SQLITE
    - heading "第一章" [level=2]
    - button "返回项目"
    - button "复制正文"
    - button "保存版本"
    - button "版本历史"
    - button "手动保存"
    - toolbar "正文块工具":
      - button "正文"
      - button "对话"
      - button "小标题"
      - button "分隔线"
      - button "撤销"
      - button "重做"
    - text: 字符
    - strong: "17"
    - text: 纯文字
    - strong: "13"
    - text: 段落
    - strong: "4"
    - text: 未设置目标
    - searchbox "查找文本"
    - button "上一个"
    - button "下一个"
    - textbox "替换文本":
      - /placeholder: 替换为
    - button "替换"
    - button "全部替换"
    - status: 自动保存完成 · Revision 4
    - textbox "第一章正文":
      - paragraph: 雨落在旧站台。
      - heading "“谁在那里？”第二节" [level=2]
      - separator
      - paragraph
    - paragraph: 正文修改空闲800ms后自动保存；切换章节、返回项目与关闭应用前会强制刷新。中文输入组合期间暂停保存。
- complementary:
  - text: 本地偏好
  - strong: 显示设置
  - text: 界面缩放
  - combobox "界面缩放":
    - option "90%"
    - option "100%" [selected]
    - option "110%"
    - option "120%"
    - option "130%"
    - option "140%"
    - option "150%"
  - text: 正文字号
  - combobox "正文字号":
    - option "14 px"
    - option "16 px"
    - option "18 px" [selected]
    - option "20 px"
    - option "22 px"
    - option "24 px"
    - option "26 px"
    - option "28 px"
  - text: 正文宽度
  - combobox "正文宽度":
    - option "窄 · 680 px"
    - option "标准 · 760 px" [selected]
    - option "宽 · 860 px"
    - option "自适应 · 680—860 px"
  - group "超宽屏工作区":
    - text: 超宽屏工作区
    - radio "偏左"
    - text: 偏左
    - radio "居中" [checked]
    - text: 居中
    - radio "偏右"
    - text: 偏右
  - status: 偏好由 Core 写入应用数据库
  - term: 布局模式
  - definition: 2K 标准 · 三栏
  - term: 有效视口
  - definition: 1440 × 900 CSS px
  - term: 实际版心
  - definition: 760 px
- contentinfo: WorldForge 0.1.0 · linux 应用设置与最近项目：app.sqlite / 正文：项目独立 仅本地
```

# Test source

```ts
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
  156 |     await expect(
  157 |       editor.locator('[data-block-type="paragraph"]').filter({ hasText: '雨落在旧站台。' }),
  158 |     ).toHaveCount(1);
> 159 |     await expect(editor.locator('[data-block-type="dialogue"]')).toContainText('谁在那里');
      |                                                                  ^ Error: expect(locator).toContainText(expected) failed
  160 |     await expect(editor.locator('[data-block-type="separator"]')).toHaveCount(1);
  161 |     await expect(editor.locator('[data-block-type="heading"]')).toContainText('第二节');
  162 |     await capture(page, 'm1-04-chinese-block-editor.png');
  163 | 
  164 |     await page.locator('[data-save-draft]').click();
  165 |     await expect(page.locator('[data-draft-state]')).toHaveText(/^已手动保存 · Revision \d+$/u);
  166 |     const revision = await page.evaluate(async () => {
  167 |       const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
  168 |         .worldforge;
  169 |       const active = await bridge.project.getActive();
  170 |       if (!active.ok || !active.data) return -1;
  171 |       const structure = await bridge.planning.listStructure(active.data.projectId);
  172 |       const chapter = structure.ok ? structure.data.volumes[0]?.chapters[0] : undefined;
  173 |       if (!chapter) return -1;
  174 |       const draft = await bridge.draft.open({
  175 |         projectId: active.data.projectId,
  176 |         chapterId: chapter.id,
  177 |       });
  178 |       return draft.ok ? draft.data.revision : -1;
  179 |     });
  180 |     expect(revision).toBeGreaterThan(0);
  181 |     await capture(page, 'm1-05-patch-revision.png');
  182 | 
  183 |     await page.locator('[data-draft-find]').fill('雨');
  184 |     await page.locator('[data-draft-find-next]').click();
  185 |     await expect(page.locator('[data-draft-find-status]')).toContainText('1');
  186 |     await expect(page.locator('[data-draft-character-count]')).not.toHaveText('0');
  187 |     await expect(page.locator('[data-draft-text-count]')).not.toHaveText('0');
  188 |     await capture(page, 'm1-06-autosave-stats-find.png');
  189 | 
  190 |     await page.locator('[data-create-version]').click();
  191 |     await page.locator('[data-version-title]').fill('M1验收版本');
  192 |     await page.locator('[data-version-label]').fill('阶段定稿');
  193 |     await page.locator('[data-version-description]').fill('延期验收固定版本');
  194 |     await page.locator('[data-confirm-version]').click();
  195 |     await expect(page.locator('[data-version-row]')).toHaveCount(1);
  196 |     await page.locator('[data-version-action="final"]').click();
  197 |     await expect(page.locator('[data-version-row]')).toContainText('定稿');
  198 |     await capture(page, 'm1-07-version-history.png');
  199 |     await page.locator('[data-close-versions]').click();
  200 | 
  201 |     await page.locator('[data-back-project]').click();
  202 |     await page.locator('[data-open-recovery]').click();
  203 |     await page.locator('[data-create-checkpoint]').click();
  204 |     await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {
  205 |       timeout: 10_000,
  206 |     });
  207 |     await page.locator('[data-export-recovery-version]').click();
  208 |     await expect(page.locator('[data-recovery-status]')).toContainText('已导出');
  209 |     await capture(page, 'm1-08-recovery-center.png');
  210 |     await page.locator('[data-close-recovery]').click();
  211 |     await page.locator('[data-close-project]').click();
  212 |     await closeGracefully(application);
  213 |     closed = true;
  214 |   } finally {
  215 |     if (!closed) await closeGracefully(application);
  216 |   }
  217 | 
  218 |   const projectDatabase = new DatabaseSync(path.join(workspacePath, 'project.sqlite'));
  219 |   projectDatabase
  220 |     .prepare(
  221 |       `INSERT INTO schema_migrations(version, name, checksum, applied_at, app_version)
  222 |        VALUES(99, 'm1-acceptance-future', 'm1-acceptance-future-checksum', ?, '9.0.0')`,
  223 |     )
  224 |     .run('2026-07-17T02:30:00.000Z');
  225 |   projectDatabase.close();
  226 | 
  227 |   const readOnlyApplication = await launch(userDataPath, environment);
  228 |   try {
  229 |     const page = await readOnlyApplication.firstWindow();
  230 |     await setViewport(readOnlyApplication);
  231 |     await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
  232 |     await page.locator('[data-open-recent]').click();
  233 |     await expect(page.locator('body')).toHaveAttribute('data-project-state', 'read-only');
  234 |     await expect(page.locator('[data-active-project-readonly]')).toContainText('future-schema');
  235 |     await expect(page.locator('[data-move-project]')).toBeDisabled();
  236 |     await capture(page, 'm1-02-read-only.png');
  237 |     await page.locator('[data-open-recovery]').click();
  238 |     await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1);
  239 |     await expect(page.locator('[data-create-checkpoint]')).toBeDisabled();
  240 |     await capture(page, 'm1-08-readonly-recovery.png');
  241 |   } finally {
  242 |     await closeGracefully(readOnlyApplication);
  243 |   }
  244 | });
  245 | 
```