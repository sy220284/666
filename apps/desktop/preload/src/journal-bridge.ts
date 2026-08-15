import {
  JOURNAL_COMMANDS,
  JOURNAL_IPC_CHANNELS,
  JournalCatalogResultSchema,
  JournalCatchUpCommandSchema,
  JournalGenerateCommandSchema,
  JournalListCommandSchema,
  JournalMarkAiFailedCommandSchema,
  JournalPreviewCommandSchema,
  JournalPreviewResultSchema,
  JournalUpdateNoteCommandSchema,
  JournalUpdatePreferencesCommandSchema,
  type JournalBridge,
} from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { invokeCommand } from './bridge-runtime.js';

const journalBridge: JournalBridge = {
  list: (input) =>
    invokeCommand(
      JOURNAL_IPC_CHANNELS.list,
      JournalListCommandSchema,
      JournalCatalogResultSchema,
      JOURNAL_COMMANDS.list,
      input,
    ),
  preview: (input) =>
    invokeCommand(
      JOURNAL_IPC_CHANNELS.preview,
      JournalPreviewCommandSchema,
      JournalPreviewResultSchema,
      JOURNAL_COMMANDS.preview,
      input,
    ),
  generate: (input) =>
    invokeCommand(
      JOURNAL_IPC_CHANNELS.generate,
      JournalGenerateCommandSchema,
      JournalCatalogResultSchema,
      JOURNAL_COMMANDS.generate,
      input,
    ),
  updateNote: (input) =>
    invokeCommand(
      JOURNAL_IPC_CHANNELS.updateNote,
      JournalUpdateNoteCommandSchema,
      JournalCatalogResultSchema,
      JOURNAL_COMMANDS.updateNote,
      input,
    ),
  updatePreferences: (input) =>
    invokeCommand(
      JOURNAL_IPC_CHANNELS.updatePreferences,
      JournalUpdatePreferencesCommandSchema,
      JournalCatalogResultSchema,
      JOURNAL_COMMANDS.updatePreferences,
      input,
    ),
  catchUp: (input) =>
    invokeCommand(
      JOURNAL_IPC_CHANNELS.catchUp,
      JournalCatchUpCommandSchema,
      JournalCatalogResultSchema,
      JOURNAL_COMMANDS.catchUp,
      input,
    ),
  markAiFailed: (input) =>
    invokeCommand(
      JOURNAL_IPC_CHANNELS.markAiFailed,
      JournalMarkAiFailedCommandSchema,
      JournalCatalogResultSchema,
      JOURNAL_COMMANDS.markAiFailed,
      input,
    ),
};

contextBridge.exposeInMainWorld('worldforgeJournal', journalBridge);
