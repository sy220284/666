/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const filePath = 'scripts/m8-04-canon-author-fields-codemod.mjs';
let source = await readFile(filePath, 'utf8');

const broadReplacement = `source = source.replaceAll('实体', '设定条目');`;
if (!source.includes(broadReplacement)) throw new Error('缺少待收窄的全文件词语替换。');
source = source.replace(
  broadReplacement,
  `for (const [before, after] of [
  ['实体已由作者命令写入项目数据库。', '设定条目已写入作品数据库。'],
  ['实体已归档；永久删除仍需通过引用预览与名称确认。', '设定条目已归档；永久删除仍需通过引用预览与名称确认。'],
  ['实体已永久删除。', '设定条目已永久删除。'],
  ['<h2>实体</h2>', '<h2>设定条目</h2>'],
  ['选择实体', '选择设定条目'],
  ['新建实体', '新建设定条目'],
  ['选择一个实体', '选择一个设定条目'],
  ['保存实体', '保存设定条目'],
  [\`实体 \${resource.data?.entities.length ?? 0}\`, \`设定条目 \${resource.data?.entities.length ?? 0}\`],
]) {
  source = source.replaceAll(before, after);
}`,
);

const factMarker = source.indexOf('{fact.factKey}');
const factBlockStart = source.lastIndexOf('replaceRequired(', factMarker);
const factBlockEnd = source.indexOf('\n);', factMarker);
if (factMarker < 0 || factBlockStart < 0 || factBlockEnd < 0) {
  throw new Error('缺少待拆分的事实显示改写块。');
}
source = `${source.slice(0, factBlockStart)}replaceRequired(
  \`<strong>{fact.factKey}</strong>\`,
  \`<strong>{authorFactLabel(fact.factKey)}</strong>\`,
);
replaceRequired(
  \`{fact.status} · {JSON.stringify(fact.value)}\`,
  \`{recordStatusLabel(fact.status)} · {authorJsonValue(fact.value)}\`,
);${source.slice(factBlockEnd + 3)}`;

const factValueOptions = String.raw`<option value="list">多项内容</option>\n              </select>`;
if (!source.includes(factValueOptions)) throw new Error('事实内容形式缺少选项锚点。');
source = source.replace(
  factValueOptions,
  String.raw`<option value="list">多项内容</option>\n                <option value="json">原始JSON（高级）</option>\n              </select>`,
);

const inertAdvancedField = String.raw`              <p>需要保存复杂结构时，可将“内容形式”改为原始JSON。</p>\n              <label>\n                原始JSON类型\n                <select name="advancedValueType" defaultValue="json" disabled>\n                  <option value="json">原始JSON</option>\n                </select>\n              </label>`;
if (!source.includes(inertAdvancedField)) throw new Error('缺少待清理的无效高级字段。');
source = source.replace(
  inertAdvancedField,
  String.raw`              <p>复杂结构请选择上方“原始JSON（高级）”，普通作者无需使用。</p>`,
);

await writeFile(filePath, source, 'utf8');
console.log('设定表单改写规则已收窄，事实显示已拆分，并补齐高级JSON入口。');
