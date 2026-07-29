/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const filePath = 'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx';
const oldExpression = '{command.error.message} · {command.error.code}';
const newExpression = '{authorErrorSummary(command.error)}';

let source = await readFile(filePath, 'utf8');
const count = source.split(oldExpression).length - 1;
if (count !== 3) {
  throw new Error(`规划页错误提示表达式数量异常：预期3处，实际${count}处。`);
}
source = source.replaceAll(oldExpression, newExpression);
await writeFile(filePath, source, 'utf8');
console.log('规划页三处错误码主提示已清理。');
