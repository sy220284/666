import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing UI anchor in ${path}`);
  await writeFile(path, source.replace(before, after), 'utf8');
}

await replaceExact(
  'apps/desktop/renderer/src/index.ts',
  "import { contentWidthPixels, layoutPolicyForViewport } from './layout-model.js';\n",
  "import { contentWidthPixels, layoutPolicyForViewport } from './layout-model.js';\nimport './canon-ui.js';\n",
);

await replaceExact(
  'apps/desktop/renderer/src/index.html',
  '                    <button class="quiet-button" type="button" data-open-planning>作品规划</button>\n',
  '                    <button class="quiet-button" type="button" data-open-planning>作品规划</button>\n                    <button class="quiet-button" type="button" data-open-canon>实体与Canon</button>\n',
);

const canonDialog = `    <dialog class="settings-dialog canon-dialog" data-canon-dialog aria-labelledby="canon-dialog-title">
      <div class="settings-dialog__body canon-dialog__body">
        <header class="canon-header">
          <div>
            <p class="eyebrow">ENTITY · STATIC CANON · PROJECT.SQLITE</p>
            <h2 id="canon-dialog-title">实体与静态Canon</h2>
            <p>人物、地点、势力、道具、能力、规则和事件统一登记；只有作者明确命令能够改变Canon。</p>
          </div>
          <button class="quiet-button" type="button" data-refresh-canon>刷新</button>
        </header>
        <p class="save-state" data-canon-status role="status"></p>
        <div class="canon-toolbar">
          <label>
            <span>实体</span>
            <select data-canon-entity-select></select>
          </label>
          <button class="quiet-button" type="button" data-new-entity data-canon-write>新建</button>
          <button class="quiet-button" type="button" data-archive-entity data-canon-write>归档</button>
          <button class="quiet-button" type="button" data-delete-entity data-canon-write>永久删除</button>
        </div>
        <div class="canon-grid">
          <section class="canon-section">
            <header>
              <div><small>ENTITY</small><h3 data-canon-entity-mode>新建实体</h3></div>
            </header>
            <form class="canon-form" data-canon-entity-form>
              <label>类型
                <select name="entityType" data-canon-write>
                  <option value="character">人物</option>
                  <option value="location">地点</option>
                  <option value="faction">势力</option>
                  <option value="item">道具</option>
                  <option value="ability">能力</option>
                  <option value="rule">规则</option>
                  <option value="event">事件</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              <label>名称<input name="name" maxlength="240" required data-canon-write /></label>
              <label>别名（每行一项）<textarea name="aliases" rows="4" data-canon-write></textarea></label>
              <label>摘要<textarea name="summary" rows="5" maxlength="20000" data-canon-write></textarea></label>
              <button class="primary-button" type="submit" data-canon-write>保存实体</button>
            </form>
          </section>
          <section class="canon-section">
            <header><div><small>CANON FACT</small><h3>静态事实</h3></div></header>
            <form class="canon-form" data-canon-fact-form>
              <label>factKey<input name="factKey" maxlength="120" placeholder="identity" /></label>
              <label>JSON值<textarea name="valueJson" rows="5" placeholder='{"name":"林照夜"}'></textarea></label>
              <label>确认说明<input name="description" maxlength="20000" /></label>
              <button class="primary-button" type="submit">确认事实</button>
            </form>
            <div class="canon-fact-list" data-canon-fact-list></div>
          </section>
        </div>
      </div>
      <footer><span></span><button class="quiet-button" type="button" data-close-canon>关闭</button></footer>
    </dialog>

`;
await replaceExact(
  'apps/desktop/renderer/src/index.html',
  '    <dialog class="boundary-dialog" data-boundary-dialog aria-labelledby="boundary-dialog-title">\n',
  `${canonDialog}    <dialog class="boundary-dialog" data-boundary-dialog aria-labelledby="boundary-dialog-title">\n`,
);

const stylePath = 'apps/desktop/renderer/src/styles.css';
let styles = await readFile(stylePath, 'utf8');
if (!styles.includes('/* M3-03 Entity Canon workspace */')) {
  styles += `

/* M3-03 Entity Canon workspace */
.canon-dialog {
  width: min(960px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
}

.canon-dialog__body {
  overflow: auto;
}

.canon-header,
.canon-toolbar,
.canon-section > header,
.canon-fact-row > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.canon-toolbar {
  flex-wrap: wrap;
  margin-block: 16px;
}

.canon-toolbar label {
  flex: 1 1 280px;
}

.canon-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.canon-section {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
}

.canon-section h3,
.canon-section small {
  margin: 0;
}

.canon-form {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.canon-form label,
.canon-toolbar label {
  display: grid;
  gap: 6px;
}

.canon-form input,
.canon-form select,
.canon-form textarea,
.canon-toolbar select {
  width: 100%;
}

.canon-fact-list {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.canon-fact-row {
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
}

.canon-fact-row[data-canon-fact-status='historical'] {
  opacity: 0.72;
}

.canon-fact-row pre {
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .canon-grid {
    grid-template-columns: 1fr;
  }
}
`;
  await writeFile(stylePath, styles, 'utf8');
}

console.log('M3-03 Canon UI wiring applied.');
