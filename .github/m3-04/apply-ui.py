from pathlib import Path

ROOT = Path.cwd()

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')

def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path} anchor count {count}: {old[:100]!r}')
    write(path, source.replace(old, new, 1))

replace_once(
    'apps/desktop/renderer/src/index.ts',
    "import './canon-ui.js';\n",
    "import './canon-ui.js';\nimport './continuity-ui.js';\n",
)
replace_once(
    'apps/desktop/renderer/src/index.html',
    '                    <button class="quiet-button" type="button" data-open-canon>实体与Canon</button>\n',
    '                    <button class="quiet-button" type="button" data-open-canon>实体与Canon</button>\n'
    '                    <button class="quiet-button" type="button" data-open-continuity>连续性</button>\n',
)

dialog = '''    <dialog class="settings-dialog continuity-dialog" data-continuity-dialog aria-labelledby="continuity-title">
      <div class="settings-dialog__body continuity-dialog__body">
        <header class="continuity-header">
          <div><p class="eyebrow">STATE · TIMELINE · KNOWLEDGE</p><h2 id="continuity-title">连续性账本</h2><p>动态状态、时间事件和人物知情均由作者确认后写入。</p></div>
          <button class="quiet-button" type="button" data-refresh-continuity>刷新</button>
        </header>
        <p class="save-state" data-continuity-status role="status"></p>
        <div class="continuity-toolbar">
          <label>搜索<input type="search" data-continuity-search /></label>
          <label class="checkbox-row"><input type="checkbox" data-continuity-include-history checked /><span>包含历史</span></label>
          <label>生效章节<select data-continuity-effective-chapter data-continuity-chapter="nullable"></select></label>
        </div>
        <section class="continuity-section">
          <header><h3>动态状态</h3></header>
          <div class="continuity-split">
            <form class="canon-form" data-entity-state-form>
              <label>实体<select name="entityId" data-continuity-entity></select></label>
              <label>stateKey<input name="stateKey" maxlength="120" required /></label>
              <label>JSON值<textarea name="valueJson" rows="3" required></textarea></label>
              <label>起始章节<select name="validFromChapterId" data-continuity-chapter></select></label>
              <label>结束章节<select name="validUntilChapterId" data-continuity-chapter="nullable"></select></label>
              <label>来源Version ID<input name="sourceVersionId" required /></label>
              <label>证据JSON<textarea name="evidenceJson" rows="3">[]</textarea></label>
              <button class="primary-button" type="submit">确认状态</button>
            </form>
            <div class="continuity-list" data-entity-state-list></div>
          </div>
        </section>
        <section class="continuity-section">
          <header><h3>时间线</h3><span><select data-timeline-event-select></select><button class="quiet-button" type="button" data-new-timeline-event>新建</button></span></header>
          <div class="continuity-split">
            <form class="canon-form" data-timeline-event-form>
              <label>标题<input name="title" maxlength="240" required /></label>
              <label>起始值<input name="startValue" maxlength="120" required /></label>
              <label>结束值<input name="endValue" maxlength="120" /></label>
              <label>精度<select name="precision"><option value="exact">精确</option><option value="day">日</option><option value="month">月</option><option value="year">年</option><option value="approximate">约略</option><option value="unknown">未知</option></select></label>
              <label>章节<select name="chapterId" data-continuity-chapter="nullable"></select></label>
              <label>地点<select name="locationId" data-continuity-location></select></label>
              <label>参与实体ID<textarea name="participantIds" rows="2"></textarea></label>
              <label>前置事件ID<textarea name="dependencyIds" rows="2"></textarea></label>
              <label>说明<textarea name="description" rows="3"></textarea></label>
              <button class="primary-button" type="submit">保存事件</button>
            </form>
            <div class="continuity-list" data-timeline-event-list></div>
          </div>
        </section>
        <section class="continuity-section">
          <header><h3>人物知情</h3></header>
          <div class="continuity-split">
            <form class="canon-form" data-knowledge-state-form>
              <label>informationKey<input name="informationKey" maxlength="240" required /></label>
              <label>人物<select name="characterId" data-continuity-character></select></label>
              <label>状态<select name="knowledgeStatus"><option value="knows">知道</option><option value="believes">相信</option><option value="suspects">怀疑</option><option value="misunderstands">误解</option><option value="unknown">未知</option></select></label>
              <label>获得章节<select name="acquiredChapterId" data-continuity-chapter="nullable"></select></label>
              <label>来源Block ID<input name="sourceBlockId" /></label>
              <label>来源Version ID<input name="sourceVersionId" /></label>
              <label>说明<textarea name="notes" rows="3"></textarea></label>
              <button class="primary-button" type="submit">确认知情状态</button>
            </form>
            <div class="continuity-list" data-knowledge-state-list></div>
          </div>
        </section>
      </div>
      <footer><span></span><button class="quiet-button" type="button" data-close-continuity>关闭</button></footer>
    </dialog>

'''
replace_once(
    'apps/desktop/renderer/src/index.html',
    '    <dialog class="boundary-dialog" data-boundary-dialog aria-labelledby="boundary-dialog-title">\n',
    dialog + '    <dialog class="boundary-dialog" data-boundary-dialog aria-labelledby="boundary-dialog-title">\n',
)

styles = read('apps/desktop/renderer/src/styles.css')
css = '''
.continuity-dialog { width: min(1180px, calc(100vw - 32px)); }
.continuity-dialog__body { display: grid; gap: 18px; max-height: min(82vh, 880px); overflow: auto; }
.continuity-header, .continuity-section > header, .continuity-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.continuity-section { display: grid; gap: 12px; padding-top: 16px; border-top: 1px solid var(--border-color); }
.continuity-split { display: grid; grid-template-columns: minmax(260px, .8fr) minmax(320px, 1.2fr); gap: 16px; }
.continuity-list { display: grid; gap: 10px; align-content: start; min-width: 0; }
.continuity-record { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: 10px; }
.continuity-record header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.continuity-record pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.continuity-copy { margin-inline-start: auto; }
@media (max-width: 840px) { .continuity-split { grid-template-columns: 1fr; } }
'''
if '.continuity-dialog {' not in styles:
    write('apps/desktop/renderer/src/styles.css', styles.rstrip() + '\n\n' + css)
