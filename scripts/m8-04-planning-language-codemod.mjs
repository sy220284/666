/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const filePath = 'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx';
const oldBlock = `        {command.error ? (\n          <p className="form-error">\n            {command.error.message} · {command.error.code}\n          </p>\n        ) : null}`;
const newBlock = `        {command.error ? (\n          <p className="form-error">{authorErrorSummary(command.error)}</p>\n        ) : null}`;

let source = await readFile(filePath, 'utf8');
const count = source.split(oldBlock).length - 1;
if (count !== 3) {
  throw new Error(`规划页错误提示块数量异常：预期3处，实际${count}处。`);
}
source = source.replaceAll(oldBlock, newBlock);
await writeFile(filePath, source, 'utf8');
console.log('规划页错误码已移入非主提示层。');
