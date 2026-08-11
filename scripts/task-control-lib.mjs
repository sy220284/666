import path from 'node:path';

export function parseTaskIndex(markdown) {
  const tasks = new Map();
  const rowPattern =
    /^\|\s*(M\d+-\d{2})\s*\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm;
  for (const match of markdown.matchAll(rowPattern)) {
    const [, id, source, dependencyText, status] = match;
    if (!id || !source || !dependencyText || !status) continue;
    tasks.set(id, {
      id,
      source: path.posix.join('docs/tasks', source),
      dependencyText: dependencyText.trim(),
      status: status.trim(),
    });
  }
  return tasks;
}
