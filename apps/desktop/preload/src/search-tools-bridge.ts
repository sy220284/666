import {
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
import { contextBridge } from 'electron';

import { invokeCommand, type Parser } from './bridge-runtime.js';

function invoke<Result>(
  channel: string,
  commandSchema: Parser<unknown>,
  resultSchema: Parser<Result>,
  command: string,
  payload: unknown,
): Promise<Result> {
  return invokeCommand(channel, commandSchema, resultSchema, command, payload);
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
