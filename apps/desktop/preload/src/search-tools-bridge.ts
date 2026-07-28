import {
  PROTOCOL_VERSION,
  SEARCH_TOOLS_COMMANDS,
  SEARCH_TOOLS_IPC_CHANNELS,
  ProjectDictionaryCommandResultSchema,
  ProjectDictionaryDeleteCommandSchema,
  ProjectDictionaryListCommandSchema,
  ProjectDictionaryUpsertCommandSchema,
  ReplaceApplyCommandResultSchema,
  ReplaceApplyCommandSchema,
  ReplacePreviewCommandResultSchema,
  ReplacePreviewCommandSchema,
  SearchIndexRebuildCommandResultSchema,
  SearchIndexRebuildCommandSchema,
  SearchIndexStateCommandResultSchema,
  SearchIndexStateCommandSchema,
  SearchProjectCommandResultSchema,
  SearchProjectCommandSchema,
  type ProjectDictionaryDeleteInput,
  type ProjectDictionaryListInput,
  type ProjectDictionaryUpsertInput,
  type ReplaceApplyInput,
  type ReplacePreviewInput,
  type SearchProjectInput,
} from '@worldforge/contracts';
import { contextBridge, ipcRenderer } from 'electron';

interface Parser<Result> {
  parse(input: unknown): Result;
}
async function invoke<Result>(
  channel: string,
  commandSchema: Parser<unknown>,
  resultSchema: Parser<Result>,
  command: string,
  payload: unknown,
): Promise<Result> {
  const envelope = commandSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    requestId: globalThis.crypto.randomUUID(),
    command,
    payload,
    sentAt: new Date().toISOString(),
  });
  return resultSchema.parse(await ipcRenderer.invoke(channel, envelope));
}

const searchToolsBridge = {
  search: (input: SearchProjectInput) =>
    invoke(
      SEARCH_TOOLS_IPC_CHANNELS.search,
      SearchProjectCommandSchema,
      SearchProjectCommandResultSchema,
      SEARCH_TOOLS_COMMANDS.search,
      input,
    ),
  getIndexState: (input: { readonly projectId: string }) =>
    invoke(
      SEARCH_TOOLS_IPC_CHANNELS.getIndexState,
      SearchIndexStateCommandSchema,
      SearchIndexStateCommandResultSchema,
      SEARCH_TOOLS_COMMANDS.getIndexState,
      input,
    ),
  rebuildIndex: (input: { readonly projectId: string }) =>
    invoke(
      SEARCH_TOOLS_IPC_CHANNELS.rebuildIndex,
      SearchIndexRebuildCommandSchema,
      SearchIndexRebuildCommandResultSchema,
      SEARCH_TOOLS_COMMANDS.rebuildIndex,
      input,
    ),
  previewReplace: (input: ReplacePreviewInput) =>
    invoke(
      SEARCH_TOOLS_IPC_CHANNELS.previewReplace,
      ReplacePreviewCommandSchema,
      ReplacePreviewCommandResultSchema,
      SEARCH_TOOLS_COMMANDS.previewReplace,
      input,
    ),
  applyReplace: (input: ReplaceApplyInput) =>
    invoke(
      SEARCH_TOOLS_IPC_CHANNELS.applyReplace,
      ReplaceApplyCommandSchema,
      ReplaceApplyCommandResultSchema,
      SEARCH_TOOLS_COMMANDS.applyReplace,
      input,
    ),
  listDictionary: (input: ProjectDictionaryListInput) =>
    invoke(
      SEARCH_TOOLS_IPC_CHANNELS.listDictionary,
      ProjectDictionaryListCommandSchema,
      ProjectDictionaryCommandResultSchema,
      SEARCH_TOOLS_COMMANDS.listDictionary,
      input,
    ),
  upsertDictionary: (input: ProjectDictionaryUpsertInput) =>
    invoke(
      SEARCH_TOOLS_IPC_CHANNELS.upsertDictionary,
      ProjectDictionaryUpsertCommandSchema,
      ProjectDictionaryCommandResultSchema,
      SEARCH_TOOLS_COMMANDS.upsertDictionary,
      input,
    ),
  deleteDictionary: (input: ProjectDictionaryDeleteInput) =>
    invoke(
      SEARCH_TOOLS_IPC_CHANNELS.deleteDictionary,
      ProjectDictionaryDeleteCommandSchema,
      ProjectDictionaryCommandResultSchema,
      SEARCH_TOOLS_COMMANDS.deleteDictionary,
      input,
    ),
} as const;

contextBridge.exposeInMainWorld('worldforgeSearchTools', searchToolsBridge);
