import { readFile, writeFile } from 'node:fs/promises';

const file = 'apps/desktop/renderer/src/app/app-shell-m3.tsx';
const content = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n');
const before = `  const closeProject = async (projectId: string): Promise<void> => {
    if (!(await flushWriting())) {
      setMessage('自动保存失败，已阻止关闭项目。');
      return;
    }
    setPendingKey(\`project.close:\${projectId}\`);
    const outcome = await bridge.project.close(projectId);
    setPendingKey(null);
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('项目关闭失败', outcome));
      return;
    }
    await projectChanged(null, '项目已安全关闭。');
    dispatch({ type: 'reset-project-context' });
    dispatch({ type: 'navigate', route: 'home' });
  };`;
const after = `  const closeProject = async (projectId: string): Promise<void> => {
    if (!(await flushWriting())) {
      setMessage('自动保存失败，已阻止关闭项目。');
      return;
    }
    setPendingKey(\`project.close:\${projectId}\`);
    try {
      const outcome = await bridge.project.close(projectId);
      if (outcome.state !== 'success') {
        setFailure(failureFromOutcome('项目关闭失败', outcome));
        return;
      }
      await projectChanged(null, '项目已安全关闭。');
      dispatch({ type: 'reset-project-context' });
      dispatch({ type: 'navigate', route: 'home' });
    } finally {
      setPendingKey(null);
    }
  };`;
const count = content.split(before).length - 1;
if (count !== 1) throw new Error(`project close transaction: expected one match, received ${count}`);
await writeFile(file, content.replace(before, after), 'utf8');
