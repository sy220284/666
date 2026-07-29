/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const filePath = 'apps/desktop/renderer/src/features/data-tools/data-tools-workbench.tsx';
let source = await readFile(filePath, 'utf8');
const before = '预览不会写入项目；提交时Core先创建恢复点。';
const after = '预览不会写入作品；提交时本地服务会先创建恢复点。';
if (!source.includes(before)) throw new Error('数据工具缺少待清理的内部名称文案。');
source = source.replace(before, after);
await writeFile(filePath, source, 'utf8');
console.log('数据工具作者文案已统一为正式中文名称。');
