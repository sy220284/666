import { readFile, writeFile } from 'node:fs/promises';

async function edit(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`NO_CHANGE:${path}`);
  await writeFile(path, after, 'utf8');
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`MISSING:${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`MULTIPLE:${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

await edit('apps/desktop/renderer/src/bridge/request-lifecycle.ts', (source) => {
  let next = replaceOnce(source, `  readonly mode?: 'reject' | 'replace';`, `  readonly mode?: 'reject' | 'replace' | 'share';`, 'share-option');
  next = replaceOnce(next, `  readonly #active = new Map<string, ActiveRequest>();\n  readonly #latestOnly = new Map<string, LatestOnlyLane>();`, `  readonly #active = new Map<string, ActiveRequest>();\n  readonly #latestOnly = new Map<string, LatestOnlyLane>();\n  readonly #shared = new Map<string, Promise<BridgeRequestOutcome<unknown>>>();`, 'shared-map');
  next = replaceOnce(next, `    const laneKey = options.mode === 'replace' ? latestOnlyLaneKey(requestKey) : null;\n    if (laneKey) return this.#runLatestOnly(laneKey, operation, options);\n    return this.#runImmediate(requestKey, operation, options);`, `    if (options.mode === 'share') return this.#runShared(requestKey, operation);\n    const laneKey = options.mode === 'replace' ? latestOnlyLaneKey(requestKey) : null;\n    if (laneKey) return this.#runLatestOnly(laneKey, operation, options);\n    return this.#runImmediate(requestKey, operation, options);`, 'share-dispatch');
  next = replaceOnce(next, `  #runLatestOnly<T>(`, `  #runShared<T>(\n    requestKey: string,\n    operation: (context: BridgeRequestContext) => Promise<CommandResult<T>>,\n  ): Promise<BridgeRequestOutcome<T>> {\n    const existing = this.#shared.get(requestKey);\n    if (existing) return existing as Promise<BridgeRequestOutcome<T>>;\n    const pending = this.#runImmediate(requestKey, operation);\n    const shared = pending as Promise<BridgeRequestOutcome<unknown>>;\n    this.#shared.set(requestKey, shared);\n    const clear = (): void => {\n      if (this.#shared.get(requestKey) === shared) this.#shared.delete(requestKey);\n    };\n    void pending.then(clear, clear);\n    return pending;\n  }\n\n  #runLatestOnly<T>(`, 'share-method');
  return next;
});

await edit('apps/desktop/renderer/src/bridge/renderer-bridge-adapter.ts', (source) =>
  replaceOnce(source, `    (!('mode' in value) || value.mode === 'reject' || value.mode === 'replace')`, `    (!('mode' in value) ||\n      value.mode === 'reject' ||\n      value.mode === 'replace' ||\n      value.mode === 'share')`, 'adapter-share'),
);

await edit('apps/desktop/renderer/src/runtime/workspace-attention.ts', (source) =>
  replaceOnce(source, `guarded(() => bridge.recovery.getOverview(projectId, { mode: 'replace' }))`, `guarded(() => bridge.recovery.getOverview(projectId, { mode: 'share' }))`, 'attention-share'),
);

await edit('apps/desktop/renderer/src/features/data-tools/data-tools-workbench.tsx', (source) =>
  replaceOnce(source, `() => bridge.recovery.getOverview(projectId, { mode: 'replace' }),`, `() => bridge.recovery.getOverview(projectId, { mode: 'share' }),`, 'panel-share'),
);

await writeFile('tests/unit/bridge-request-sharing.test.ts', `import { describe, expect, it } from 'vitest';\n\nimport { BridgeRequestCoordinator } from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';\n\ndescribe('BridgeRequestCoordinator shared reads', () => {\n  it('reuses one in-flight read for concurrent consumers', async () => {\n    const coordinator = new BridgeRequestCoordinator();\n    let calls = 0;\n    let release = () => undefined;\n    const gate = new Promise<void>((resolve) => { release = resolve; });\n    const operation = async () => {\n      calls += 1;\n      await gate;\n      return { ok: true as const, requestId: 'shared-read', data: { checkpoints: 1 } };\n    };\n    const first = coordinator.run('recovery.getOverview:project', operation, { mode: 'share' });\n    const second = coordinator.run('recovery.getOverview:project', operation, { mode: 'share' });\n    await Promise.resolve();\n    expect(calls).toBe(1);\n    release();\n    await expect(first).resolves.toMatchObject({ state: 'success', data: { checkpoints: 1 } });\n    await expect(second).resolves.toMatchObject({ state: 'success', data: { checkpoints: 1 } });\n  });\n});\n`, { encoding: 'utf8', flag: 'wx' });

console.log('M8-02 shared recovery query codemod applied.');
