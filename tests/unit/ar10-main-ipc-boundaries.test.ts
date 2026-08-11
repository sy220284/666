import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const mainRoot = 'apps/desktop/main/src';
const registrarFiles = [
  'app-ipc-handlers.ts',
  'project-ipc-handlers.ts',
  'recovery-ipc-handlers.ts',
  'planning-ipc-handlers.ts',
  'canon-ipc-handlers.ts',
  'structure-ipc-handlers.ts',
  'writing-ipc-handlers.ts',
  'task-ipc-handlers.ts',
] as const;

describe('AR-10 Main IPC boundaries', () => {
  it('keeps the root registrar limited to domain composition and deterministic disposal', async () => {
    const root = await readFile(`${mainRoot}/ipc-handlers.ts`, 'utf8');

    for (const file of registrarFiles) {
      expect(root).toContain(`./${file.replace('.ts', '.js')}`);
    }
    expect(root).toContain('./handler-guard.js');
    expect(root).toContain('./provider-ipc-handlers.js');
    expect(root).not.toContain('IPC_CHANNELS.');
    expect(root).not.toContain('CommandSchema');
    expect(root.indexOf('disposeProviderHandlers();')).toBeLessThan(
      root.indexOf('context.disposeInvokeHandlers();'),
    );
    expect(root.indexOf('context.disposeInvokeHandlers();')).toBeLessThan(
      root.indexOf('disposeTaskHandlers();'),
    );
  });

  it('centralizes trust, schema failure, unexpected exception and operation semantics in one guard', async () => {
    const [guard, semantics] = await Promise.all([
      readFile(`${mainRoot}/handler-guard.ts`, 'utf8'),
      readFile(`${mainRoot}/project-operation-semantics.ts`, 'utf8'),
    ]);

    expect(guard).toContain('function trustedSender');
    expect(guard).toContain("'COMMON_INVALID_INPUT_001'");
    expect(guard).toContain("'COMMON_INTERNAL_999'");
    expect(guard).toContain("'ipc.handler.unexpected'");
    expect(guard).toContain('createDiagnosticId()');
    expect(guard).toContain('coreOperationFailureSemantics');
    expect(guard).toContain('projectOperationKind(operation.operation)');
    expect(guard).not.toContain('QUERY_PROJECT_OPERATIONS');
    expect(semantics).toContain('PROJECT_OPERATION_SEMANTICS');
    expect(semantics).toContain('Record<CoreProjectOperation');
    expect(guard).toContain('invokeChannels.add(channel)');
    expect(guard).toContain('invokeChannels.clear()');
  });

  it('assigns every IPC channel reference to exactly one domain except task connect disposal', async () => {
    const sources = await Promise.all(
      registrarFiles.map((file) => readFile(`${mainRoot}/${file}`, 'utf8')),
    );
    const channelReferences = sources
      .join('\n')
      .matchAll(/(?:CANDIDATE_)?IPC_CHANNELS\.([A-Za-z0-9_]+)/gu);
    const counts = new Map<string, number>();
    for (const match of channelReferences) {
      const channel = match[1];
      counts.set(channel, (counts.get(channel) ?? 0) + 1);
    }

    expect(counts.size).toBe(98);
    expect(counts.get('taskConnectEvents')).toBe(2);
    expect(
      [...counts.entries()].filter(
        ([channel, count]) => channel !== 'taskConnectEvents' && count !== 1,
      ),
    ).toEqual([]);
    expect(sources.every((source) => source.includes('IpcHandlerContext'))).toBe(true);
  });
});
