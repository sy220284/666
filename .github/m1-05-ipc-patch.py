from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    if old not in content:
        raise SystemExit(f"Anchor not found in {path}: {old[:80]!r}")
    file.write_text(content.replace(old, new, 1))


replace_once(
    "packages/contracts/src/index.ts",
    "  DraftOpenCommandSchema,\n  DraftSaveSnapshotCommandSchema,\n  type DraftDocument,\n  type DraftOpenInput,\n  type DraftSaveSnapshotInput,",
    "  DraftApplyPatchCommandSchema,\n  DraftOpenCommandSchema,\n  DraftSaveSnapshotCommandSchema,\n  type DraftApplyPatchInput,\n  type DraftDocument,\n  type DraftOpenInput,\n  type DraftSaveSnapshotInput,",
)
replace_once(
    "packages/contracts/src/index.ts",
    "  DraftOpenCommandSchema,\n  DraftSaveSnapshotCommandSchema,",
    "  DraftOpenCommandSchema,\n  DraftApplyPatchCommandSchema,\n  DraftSaveSnapshotCommandSchema,",
)
replace_once(
    "packages/contracts/src/index.ts",
    "  readonly draft: {\n    readonly open: (input: DraftOpenInput) => Promise<CommandResult<DraftDocument>>;\n    readonly saveSnapshot:",
    "  readonly draft: {\n    readonly open: (input: DraftOpenInput) => Promise<CommandResult<DraftDocument>>;\n    readonly applyPatch: (input: DraftApplyPatchInput) => Promise<CommandResult<DraftDocument>>;\n    readonly saveSnapshot:",
)

replace_once(
    "apps/desktop/main/src/ipc-handlers.ts",
    "  DraftOpenCommandSchema,\n  DraftSaveSnapshotCommandSchema,",
    "  DraftApplyPatchCommandSchema,\n  DraftOpenCommandSchema,\n  DraftSaveSnapshotCommandSchema,",
)
replace_once(
    "apps/desktop/main/src/ipc-handlers.ts",
    "    IPC_CHANNELS.openDraft,\n    IPC_CHANNELS.saveDraftSnapshot,",
    "    IPC_CHANNELS.openDraft,\n    IPC_CHANNELS.applyPatch,\n    IPC_CHANNELS.saveDraftSnapshot,",
)
replace_once(
    "apps/desktop/main/src/ipc-handlers.ts",
    "  register(IPC_CHANNELS.saveDraftSnapshot, async (event, raw) => {",
    "  register(IPC_CHANNELS.applyPatch, async (event, raw) => {\n    const rejected = rejectUntrusted(event, raw);\n    if (rejected) return rejected;\n    const parsed = DraftApplyPatchCommandSchema.safeParse(raw);\n    if (!parsed.success) return invalidRequest(raw);\n    return invokeProject(parsed.data.requestId, {\n      operation: DRAFT_COMMANDS.applyPatch,\n      input: parsed.data.payload,\n    });\n  });\n\n  register(IPC_CHANNELS.saveDraftSnapshot, async (event, raw) => {",
)

replace_once(
    "apps/desktop/preload/src/index.ts",
    "  DraftDocumentResultSchema,\n  DraftOpenCommandSchema,\n  DraftSaveSnapshotCommandSchema,",
    "  DraftApplyPatchCommandSchema,\n  DraftDocumentResultSchema,\n  DraftOpenCommandSchema,\n  DraftSaveSnapshotCommandSchema,",
)
replace_once(
    "apps/desktop/preload/src/index.ts",
    "    saveSnapshot: (input) =>\n      invoke(",
    "    applyPatch: (input) =>\n      invoke(\n        IPC_CHANNELS.applyPatch,\n        DraftApplyPatchCommandSchema.parse(envelope(APP_COMMANDS.applyPatch, input)),\n        DraftDocumentResultSchema,\n      ),\n    saveSnapshot: (input) =>\n      invoke(",
)

replace_once(
    "apps/desktop/renderer/src/index.ts",
    "  assertEditorNodeMetadata,\n  createWorldforgeEditorExtensions,",
    "  assertEditorNodeMetadata,\n  buildDraftPatchOperations,\n  createWorldforgeEditorExtensions,",
)
replace_once(
    "apps/desktop/renderer/src/index.ts",
    "  setDraftState('正在以单事务保存 DraftBlock 快照…');",
    "  setDraftState('正在以单事务应用 Block Patch…');",
)
replace_once(
    "apps/desktop/renderer/src/index.ts",
    "    const blocks = tiptapJsonToDraftSnapshot(json, temporaryClientBlockId);\n    const result = await window.worldforge.draft.saveSnapshot({\n      projectId: project.projectId,\n      chapterId: chapter.id,\n      draftId: draft.draftId,\n      blocks,\n    });",
    "    const blocks = tiptapJsonToDraftSnapshot(json, temporaryClientBlockId);\n    const operations = buildDraftPatchOperations(persistedBlocks(draft), blocks);\n    if (operations.length === 0) {\n      draftDirty = false;\n      setDraftState('正文没有需要保存的变化。');\n      return;\n    }\n    const result = await window.worldforge.draft.applyPatch({\n      projectId: project.projectId,\n      chapterId: chapter.id,\n      draftId: draft.draftId,\n      baseRevision: draft.revision,\n      operations,\n    });",
)
replace_once(
    "apps/desktop/renderer/src/index.ts",
    "      setDraftState('已手动保存到 project.sqlite。');",
    "      setDraftState(`已提交 Revision ${result.data.revision} 到 project.sqlite。`);",
)
