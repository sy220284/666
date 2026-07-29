/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const replacements = [
  {
    path: 'scripts/task-control-lib.mjs',
    before:
      "      '当前作者已授权实现优先的PR模式：每张任务必须在独立非main分支完成并提交Pull Request；PR Policy、Task Governance、Security、Performance、Evidence与Quality全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。';",
    after:
      "      '当前作者已授权实现优先的合并请求模式：每张任务必须在独立非main分支完成并提交合并请求；合并请求规则、任务治理、安全、性能、验证记录与质量门禁全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。';",
  },
  {
    path: 'docs/tasks/ACTIVE_TASK.md',
    before:
      '当前作者已授权实现优先的PR模式：每张任务必须在独立非main分支完成并提交Pull Request；PR Policy、Task Governance、Security、Performance、Evidence与Quality全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。',
    after:
      '当前作者已授权实现优先的合并请求模式：每张任务必须在独立非main分支完成并提交合并请求；合并请求规则、任务治理、安全、性能、验证记录与质量门禁全部通过后，才允许执行受控合并。机器人和GitHub Actions不得直接推送main；任何代码、测试、安全或数据边界失败立即阻断。',
  },
];

for (const replacement of replacements) {
  const source = await readFile(replacement.path, 'utf8');
  if (!source.includes(replacement.before)) {
    throw new Error(`${replacement.path} 缺少预期旧文案`);
  }
  await writeFile(replacement.path, source.replace(replacement.before, replacement.after), 'utf8');
}

console.log('任务状态生成语言已统一。');
