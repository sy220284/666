/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const filePath = 'apps/desktop/renderer/src/features/canon/canon-core-workbench.tsx';
let source = await readFile(filePath, 'utf8');

function replaceRequired(before, after) {
  if (!source.includes(before)) throw new Error(`设定工作台缺少预期片段：${before.slice(0, 180)}`);
  source = source.replace(before, after);
}

replaceRequired(
  `import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';`,
  `import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';\nimport { authorErrorSummary } from '../../presentation/author-error-message.js';\nimport {\n  authorCharacterArcStatusLabel,\n  authorForeshadowingStatusLabel,\n  authorJsonValue,\n} from '../../presentation/author-value-format.js';\nimport {\n  arcTypeLabel,\n  authorFactLabel,\n  authorStateLabel,\n  ChapterNameSelect,\n  chapterName,\n  COMMON_FACT_FIELDS,\n  COMMON_STATE_FIELDS,\n  EntityNameSelect,\n  entityName,\n  FinalVersionSelect,\n  knowledgeStatusLabel,\n  parseAuthorValue,\n  promptChapterId,\n  recordStatusLabel,\n  timelinePrecisionLabel,\n  useCanonAuthorReferences,\n  type AuthorValueType,\n  type CanonAuthorReferences,\n} from './canon-author-fields.js';`,
);

replaceRequired(
  `}: CanonWorkbenchProps) {\n  return (`,
  `}: CanonWorkbenchProps) {\n  const references = useCanonAuthorReferences(bridge, projectId);\n  return (`,
);
replaceRequired(
  `          projectName={projectName}\n          readOnly={readOnly}\n        />`,
  `          projectName={projectName}\n          readOnly={readOnly}\n          references={references}\n        />`,
);
replaceRequired(
  `          projectName={projectName}\n          readOnly={readOnly}\n        />\n      ) : null}\n      {section === 'proposals'`,
  `          projectName={projectName}\n          readOnly={readOnly}\n          references={references}\n        />\n      ) : null}\n      {section === 'proposals'`,
);

replaceRequired(
  `    let value: Parameters<RendererBridgeAdapter['canon']['setFact']>[0]['value'];\n    try {\n      value = JSON.parse(String(values.get('value') ?? 'null')) as Parameters<\n        RendererBridgeAdapter['canon']['setFact']\n      >[0]['value'];\n    } catch {\n      setNotice('事实值必须是有效JSON。');\n      return;\n    }`,
  `    const selectedFactKey = String(values.get('factKey') ?? '');\n    const factKey =\n      selectedFactKey === 'custom' ? String(values.get('customFactKey') ?? '').trim() : selectedFactKey;\n    if (!factKey) {\n      setNotice('请填写自定义事实名称。');\n      return;\n    }\n    let value: Parameters<RendererBridgeAdapter['canon']['setFact']>[0]['value'];\n    try {\n      value = parseAuthorValue(\n        String(values.get('valueType') ?? 'text') as AuthorValueType,\n        String(values.get('value') ?? ''),\n      ) as typeof value;\n    } catch (error) {\n      setNotice(error instanceof Error ? error.message : '事实值格式不正确。');\n      return;\n    }`,
);
replaceRequired(`        factKey: String(values.get('factKey') ?? ''),`, `        factKey,`);
replaceRequired(
  `                   <strong>{fact.factKey}</strong>\n                   <span>\n                     {fact.status} · {JSON.stringify(fact.value)}\n                   </span>`,
  `                   <strong>{authorFactLabel(fact.factKey)}</strong>\n                   <span>\n                     {recordStatusLabel(fact.status)} · {authorJsonValue(fact.value)}\n                   </span>`,
);
replaceRequired(
  `            <label>\n              事实键\n              <input name="factKey" required />\n            </label>\n            <label>\n              JSON值\n              <textarea name="value" defaultValue="null" required />\n            </label>`,
  `            <label>\n              事实类型\n              <select name="factKey" defaultValue="appearance">\n                {COMMON_FACT_FIELDS.map((field) => (\n                  <option key={field.key} value={field.key}>\n                    {field.label}\n                  </option>\n                ))}\n                <option value="custom">其他自定义事实</option>\n              </select>\n            </label>\n            <label>\n              内容形式\n              <select name="valueType" defaultValue="text">\n                <option value="text">文字</option>\n                <option value="number">数字</option>\n                <option value="boolean">是 / 否</option>\n                <option value="list">多项内容</option>\n              </select>\n            </label>\n            <label>\n              内容\n              <textarea name="value" placeholder="多项内容可用换行或顿号分隔" required />\n            </label>\n            <details>\n              <summary>高级自定义字段</summary>\n              <label>\n                自定义事实名称\n                <input name="customFactKey" />\n              </label>\n              <p>需要保存复杂结构时，可将“内容形式”改为原始JSON。</p>\n              <label>\n                原始JSON类型\n                <select name="advancedValueType" defaultValue="json" disabled>\n                  <option value="json">原始JSON</option>\n                </select>\n              </label>\n            </details>`,
);

replaceRequired(
  `function ContinuityPanel({\n  bridge,\n  projectId,\n  projectName,\n  readOnly,`,
  `function ContinuityPanel({\n  bridge,\n  projectId,\n  projectName,\n  readOnly,\n  references,`,
);
replaceRequired(
  `  readonly projectName: string;\n  readonly readOnly: boolean;\n}) {\n  const [query, setQuery] = useState('');`,
  `  readonly projectName: string;\n  readonly readOnly: boolean;\n  readonly references: CanonAuthorReferences;\n}) {\n  const [query, setQuery] = useState('');`,
);
replaceRequired(
  `        <input\n          aria-label="生效章节"\n          placeholder="可选：生效章节内部标识"\n          value={effectiveChapter}\n          onChange={(event) => setEffectiveChapter(event.target.value)}\n        />`,
  `        <ChapterNameSelect\n          aria-label="生效章节"\n          emptyLabel="全部章节"\n          references={references}\n          value={effectiveChapter}\n          onChange={(event) => setEffectiveChapter(event.target.value)}\n        />`,
);
replaceRequired(
  `      <ContinuityResults catalog={resource.data} />`,
  `      <ContinuityResults catalog={resource.data} references={references} />`,
);
replaceRequired(
  `        readOnly={readOnly}\n        onRefresh={resource.refresh}`,
  `        readOnly={readOnly}\n        references={references}\n        onRefresh={resource.refresh}`,
);
replaceRequired(
  `function ContinuityResults({ catalog }: { readonly catalog: ContinuityCatalog | null }) {`,
  `function ContinuityResults({\n  catalog,\n  references,\n}: {\n  readonly catalog: ContinuityCatalog | null;\n  readonly references: CanonAuthorReferences;\n}) {`,
);
replaceRequired(
  `            title={state.stateKey}\n            lines={[\n              state.recordStatus,\n              JSON.stringify(state.value),\n              \`${'${state.validFromChapterId}'} → ${'${state.validUntilChapterId ?? \'当前\'}'}\`,\n            ]}`,
  `            title={\`${'${entityName(references, state.entityId)}'} · ${'${authorStateLabel(state.stateKey)}'}\`}\n            lines={[\n              recordStatusLabel(state.recordStatus),\n              authorJsonValue(state.value),\n              \`${'${chapterName(references, state.validFromChapterId)}'} → ${'${chapterName(references, state.validUntilChapterId)}'}\`,\n            ]}`,
);
replaceRequired(
  `            lines={[\n              event.status,\n              \`${'${event.startValue}'} → ${'${event.endValue ?? event.startValue}'}\`,\n              event.description,\n            ]}`,
  `            lines={[\n              recordStatusLabel(event.status),\n              \`${'${event.startValue}'} → ${'${event.endValue ?? event.startValue}'} · ${'${timelinePrecisionLabel(event.precision)}'}\`,\n              event.chapterId ? chapterName(references, event.chapterId) : '',\n              event.locationId ? entityName(references, event.locationId) : '',\n              event.description,\n            ]}`,
);
replaceRequired(
  `            title={state.informationKey}\n            lines={[state.knowledgeStatus, state.recordStatus, state.notes]}`,
  `            title={\`${'${entityName(references, state.characterId)}'} · ${'${state.informationKey}'}\`}\n            lines={[\n              knowledgeStatusLabel(state.knowledgeStatus),\n              recordStatusLabel(state.recordStatus),\n              state.notes,\n            ]}`,
);
replaceRequired(
  `  readOnly,\n  onRefresh,\n}: {\n  readonly bridge: RendererBridgeAdapter;\n  readonly catalog: ContinuityCatalog | null;\n  readonly projectId: string;\n  readonly readOnly: boolean;\n  readonly onRefresh: () => Promise<void>;`,
  `  readOnly,\n  references,\n  onRefresh,\n}: {\n  readonly bridge: RendererBridgeAdapter;\n  readonly catalog: ContinuityCatalog | null;\n  readonly projectId: string;\n  readonly readOnly: boolean;\n  readonly references: CanonAuthorReferences;\n  readonly onRefresh: () => Promise<void>;`,
);
replaceRequired(
  `    let value: Parameters<RendererBridgeAdapter['continuity']['setEntityState']>[0]['value'];\n    try {\n      value = JSON.parse(String(values.get('value') ?? 'null')) as typeof value;\n    } catch {\n      return;\n    }`,
  `    const selectedStateKey = String(values.get('stateKey') ?? '');\n    const stateKey =\n      selectedStateKey === 'custom'\n        ? String(values.get('customStateKey') ?? '').trim()\n        : selectedStateKey;\n    if (!stateKey) return;\n    let value: Parameters<RendererBridgeAdapter['continuity']['setEntityState']>[0]['value'];\n    try {\n      value = parseAuthorValue(\n        String(values.get('valueType') ?? 'text') as AuthorValueType,\n        String(values.get('value') ?? ''),\n      ) as typeof value;\n    } catch {\n      return;\n    }`,
);
replaceRequired(`        stateKey: String(values.get('stateKey')),`, `        stateKey,`);
replaceRequired(`        participantIds: [],`, `        participantIds: values.getAll('participantIds').map(String).filter(Boolean),`);
replaceRequired(
  `          <label>\n            设定条目内部标识\n            <input name="entityId" required />\n          </label>\n          <label>\n            状态键\n            <input name="stateKey" required />\n          </label>\n          <label>\n            JSON值\n            <textarea name="value" defaultValue="null" required />\n          </label>\n          <label>\n            起始章节内部标识\n            <input name="validFromChapterId" required />\n          </label>\n          <label>\n            结束章节内部标识\n            <input name="validUntilChapterId" />\n          </label>\n          <label>\n            来源历史版本内部标识\n            <input name="sourceVersionId" required />\n          </label>`,
  `          <label>\n            人物或设定\n            <EntityNameSelect name="entityId" references={references} required />\n          </label>\n          <label>\n            状态类型\n            <select name="stateKey" defaultValue="location">\n              {COMMON_STATE_FIELDS.map((field) => (\n                <option key={field.key} value={field.key}>\n                  {field.label}\n                </option>\n              ))}\n              <option value="custom">其他自定义状态</option>\n            </select>\n          </label>\n          <label>\n            内容形式\n            <select name="valueType" defaultValue="text">\n              <option value="text">文字</option>\n              <option value="number">数字</option>\n              <option value="boolean">是 / 否</option>\n              <option value="list">多项内容</option>\n              <option value="json">原始JSON（高级）</option>\n            </select>\n          </label>\n          <label>\n            当前内容\n            <textarea name="value" required />\n          </label>\n          <label>\n            从哪一章开始生效\n            <ChapterNameSelect name="validFromChapterId" references={references} required />\n          </label>\n          <label>\n            到哪一章结束\n            <ChapterNameSelect name="validUntilChapterId" references={references} />\n          </label>\n          <label>\n            依据的定稿版本\n            <FinalVersionSelect name="sourceVersionId" references={references} required />\n          </label>\n          <details>\n            <summary>高级自定义状态</summary>\n            <label>\n              自定义状态名称\n              <input name="customStateKey" />\n            </label>\n          </details>`,
);
replaceRequired(
  `              {['exact', 'day', 'month', 'year', 'approximate', 'unknown'].map((value) => (\n                <option key={value} value={value}>\n                  {value}\n                </option>\n              ))}`,
  `              {['exact', 'day', 'month', 'year', 'approximate', 'unknown'].map((value) => (\n                <option key={value} value={value}>\n                  {timelinePrecisionLabel(value)}\n                </option>\n              ))}`,
);
replaceRequired(
  `          <label>\n            章节内部标识\n            <input name="chapterId" />\n          </label>\n          <label>\n            地点内部标识\n            <input name="locationId" />\n          </label>`,
  `          <label>\n            对应章节\n            <ChapterNameSelect name="chapterId" references={references} />\n          </label>\n          <label>\n            发生地点\n            <EntityNameSelect name="locationId" entityType="location" references={references} />\n          </label>\n          <label>\n            参与人物\n            <EntityNameSelect\n              name="participantIds"\n              entityType="character"\n              references={references}\n              multiple\n            />\n          </label>`,
);
replaceRequired(
  `          <label>\n            信息键\n            <input name="informationKey" required />\n          </label>\n          <label>\n            人物内部标识\n            <input name="characterId" required />\n          </label>`,
  `          <label>\n            知情内容\n            <input name="informationKey" placeholder="人物知道或误解了什么" required />\n          </label>\n          <label>\n            人物\n            <EntityNameSelect\n              name="characterId"\n              entityType="character"\n              references={references}\n              required\n            />\n          </label>`,
);
replaceRequired(
  `              {['knows', 'believes', 'suspects', 'misunderstands', 'unknown'].map((value) => (\n                <option key={value} value={value}>\n                  {value}\n                </option>\n              ))}`,
  `              {['knows', 'believes', 'suspects', 'misunderstands', 'unknown'].map((value) => (\n                <option key={value} value={value}>\n                  {knowledgeStatusLabel(value)}\n                </option>\n              ))}`,
);
replaceRequired(
  `          <label>\n            起始章节内部标识\n            <input name="validFromChapterId" required />\n          </label>\n          <label>\n            结束章节内部标识\n            <input name="validUntilChapterId" />\n          </label>\n          <label>\n            来源历史版本内部标识\n            <input name="sourceVersionId" />\n          </label>\n          <label>\n            来源正文块内部标识\n            <input name="sourceLogicalBlockId" />\n          </label>`,
  `          <label>\n            从哪一章开始生效\n            <ChapterNameSelect name="validFromChapterId" references={references} required />\n          </label>\n          <label>\n            到哪一章结束\n            <ChapterNameSelect name="validUntilChapterId" references={references} />\n          </label>\n          <label>\n            依据的定稿版本\n            <FinalVersionSelect name="sourceVersionId" references={references} />\n          </label>\n          <details>\n            <summary>高级来源定位</summary>\n            <label>\n              来源正文块内部标识\n              <input name="sourceLogicalBlockId" />\n            </label>\n          </details>`,
);

replaceRequired(
  `function NarrativePanel({\n  bridge,\n  projectId,\n  projectName,\n  readOnly,`,
  `function NarrativePanel({\n  bridge,\n  projectId,\n  projectName,\n  readOnly,\n  references,`,
);
replaceRequired(
  `  readonly projectName: string;\n  readonly readOnly: boolean;\n}) {\n  const [query, setQuery] = useState('');\n  const [chapter, setChapter] = useState('');`,
  `  readonly projectName: string;\n  readonly readOnly: boolean;\n  readonly references: CanonAuthorReferences;\n}) {\n  const [query, setQuery] = useState('');\n  const [chapter, setChapter] = useState('');`,
);
replaceRequired(
  `        <input\n          data-narrative-reference-chapter\n          placeholder="参考章节内部标识"\n          value={chapter}\n          onChange={(event) => setChapter(event.target.value)}\n        />`,
  `        <ChapterNameSelect\n          data-narrative-reference-chapter\n          emptyLabel="全部章节"\n          references={references}\n          value={chapter}\n          onChange={(event) => setChapter(event.target.value)}\n        />`,
);
replaceRequired(
  `      <NarrativeResults catalog={resource.data} />`,
  `      <NarrativeResults catalog={resource.data} references={references} />`,
);
replaceRequired(
  `        readOnly={readOnly}\n        onRefresh={resource.refresh}\n      />\n    </section>\n  );\n}\n\nfunction NarrativeResults`,
  `        readOnly={readOnly}\n        references={references}\n        onRefresh={resource.refresh}\n      />\n    </section>\n  );\n}\n\nfunction NarrativeResults`,
);
replaceRequired(
  `function NarrativeResults({ catalog }: { readonly catalog: NarrativePlanningCatalog | null }) {`,
  `function NarrativeResults({\n  catalog,\n  references,\n}: {\n  readonly catalog: NarrativePlanningCatalog | null;\n  readonly references: CanonAuthorReferences;\n}) {`,
);
replaceRequired(
  `            lines={[item.status, item.description, ...item.warnings]}`,
  `            lines={[\n              authorForeshadowingStatusLabel(item.status),\n              item.revealFromChapterId\n                ? \`最早：${'${chapterName(references, item.revealFromChapterId)}'}\`\n                : '',\n              item.revealByChapterId\n                ? \`最晚：${'${chapterName(references, item.revealByChapterId)}'}\`\n                : '',\n              item.description,\n              ...item.warnings,\n            ]}`,
);
replaceRequired(
  `              {arc.status} · {arc.arcType}`,
  `              {authorCharacterArcStatusLabel(arc.status)} · {arcTypeLabel(arc.arcType)} ·{' '}\n              {entityName(references, arc.characterId)}`,
);
replaceRequired(
  `                  {milestone.status} · {milestone.confirmationSource ?? '未确认'}`,
  `                  {milestone.status === 'hit'\n                    ? '已命中'\n                    : milestone.status === 'skipped'\n                      ? '已跳过'\n                      : '待命中'}{' '}\n                  · {milestone.actualChapterId\n                    ? chapterName(references, milestone.actualChapterId)\n                    : '尚未确认章节'}`,
);
replaceRequired(
  `  readOnly,\n  onRefresh,\n}: {\n  readonly bridge: RendererBridgeAdapter;\n  readonly catalog: NarrativePlanningCatalog | null;\n  readonly projectId: string;\n  readonly readOnly: boolean;\n  readonly onRefresh: () => Promise<void>;`,
  `  readOnly,\n  references,\n  onRefresh,\n}: {\n  readonly bridge: RendererBridgeAdapter;\n  readonly catalog: NarrativePlanningCatalog | null;\n  readonly projectId: string;\n  readonly readOnly: boolean;\n  readonly references: CanonAuthorReferences;\n  readonly onRefresh: () => Promise<void>;`,
);
replaceRequired(
  `    const actualChapterId =\n      status === 'hit' ? window.prompt('实际命中章节内部标识：')?.trim() || null : null;`,
  `    const actualChapterId =\n      status === 'hit' ? promptChapterId(references.chapters, '选择实际命中章节序号：') : null;`,
);
replaceRequired(
  `          <label>\n            最早回收章节内部标识\n            <input name="revealFromChapterId" />\n          </label>\n          <label>\n            最晚回收章节内部标识\n            <input name="revealByChapterId" />\n          </label>`,
  `          <label>\n            最早回收章节\n            <ChapterNameSelect name="revealFromChapterId" references={references} />\n          </label>\n          <label>\n            最晚回收章节\n            <ChapterNameSelect name="revealByChapterId" references={references} />\n          </label>`,
);
replaceRequired(
  `                  {status}\n                </option>`,
  `                  {authorForeshadowingStatusLabel(status)}\n                </option>`,
);
replaceRequired(
  `          <label>\n            人物内部标识\n            <input name="characterId" required />\n          </label>`,
  `          <label>\n            人物\n            <EntityNameSelect\n              name="characterId"\n              entityType="character"\n              references={references}\n              required\n            />\n          </label>`,
);
replaceRequired(
  `                  {value}\n                </option>\n              ))}\n            </select>\n          </label>\n          <label>\n            自定义类型`,
  `                  {arcTypeLabel(value)}\n                </option>\n              ))}\n            </select>\n          </label>\n          <label>\n            自定义类型`,
);
replaceRequired(
  `                  {value}\n                </option>\n              ))}\n            </select>\n          </label>\n          <label>\n            作者意图`,
  `                  {authorCharacterArcStatusLabel(value)}\n                </option>\n              ))}\n            </select>\n          </label>\n          <label>\n            作者意图`,
);
replaceRequired(
  `          <label>\n            计划章节内部标识\n            <input name="plannedChapterId" />\n          </label>`,
  `          <label>\n            计划章节\n            <ChapterNameSelect name="plannedChapterId" references={references} />\n          </label>`,
);
replaceRequired(
  `                {arc.title} / {milestone.title} · {milestone.status}`,
  `                {arc.title} / {milestone.title} ·{' '}\n                {milestone.status === 'hit'\n                  ? '已命中'\n                  : milestone.status === 'skipped'\n                    ? '已跳过'\n                    : '待命中'}`,
);

source = source.replaceAll(
  `{command.error.message} · {command.error.code}`,
  `{authorErrorSummary(command.error)}`,
);
source = source.replaceAll('实体', '设定条目');
source = source.replaceAll('Canon事实', '已确认事实');
source = source.replaceAll('实体与Canon', '人物与设定');

await writeFile(filePath, source, 'utf8');

const governedPath = 'docs/product/AUTHOR_LANGUAGE_GOVERNED_PATHS.json';
const governed = JSON.parse(await readFile(governedPath, 'utf8'));
for (const path of [
  'apps/desktop/renderer/src/features/canon/canon-author-fields.tsx',
  'apps/desktop/renderer/src/features/canon/canon-core-workbench.tsx',
  'tests/unit/canon-author-fields.test.ts',
]) {
  if (!governed.paths.includes(path)) governed.paths.push(path);
}
await writeFile(governedPath, `${JSON.stringify(governed, null, 2)}\n`, 'utf8');
console.log('设定与前后文管理已接入名称选择器和结构化字段。');
