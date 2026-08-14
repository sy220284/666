import {
  RESEARCH_COMMANDS,
  RESEARCH_IPC_CHANNELS,
  ResearchAddLinkCommandSchema,
  ResearchCatalogResultSchema,
  ResearchCreateNoteCommandSchema,
  ResearchDeleteAttachmentCommandSchema,
  ResearchImportAttachmentCommandSchema,
  ResearchListCommandSchema,
  ResearchRemoveLinkCommandSchema,
  ResearchSetNoteStatusCommandSchema,
  ResearchUpdateNoteCommandSchema,
  type ResearchBridge,
} from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { invokeCommand } from './bridge-runtime.js';

const researchBridge: ResearchBridge = {
  list: (input) =>
    invokeCommand(
      RESEARCH_IPC_CHANNELS.list,
      ResearchListCommandSchema,
      ResearchCatalogResultSchema,
      RESEARCH_COMMANDS.list,
      input,
    ),
  createNote: (input) =>
    invokeCommand(
      RESEARCH_IPC_CHANNELS.createNote,
      ResearchCreateNoteCommandSchema,
      ResearchCatalogResultSchema,
      RESEARCH_COMMANDS.createNote,
      input,
    ),
  updateNote: (input) =>
    invokeCommand(
      RESEARCH_IPC_CHANNELS.updateNote,
      ResearchUpdateNoteCommandSchema,
      ResearchCatalogResultSchema,
      RESEARCH_COMMANDS.updateNote,
      input,
    ),
  setNoteStatus: (input) =>
    invokeCommand(
      RESEARCH_IPC_CHANNELS.setNoteStatus,
      ResearchSetNoteStatusCommandSchema,
      ResearchCatalogResultSchema,
      RESEARCH_COMMANDS.setNoteStatus,
      input,
    ),
  importAttachment: (input) =>
    invokeCommand(
      RESEARCH_IPC_CHANNELS.importAttachment,
      ResearchImportAttachmentCommandSchema,
      ResearchCatalogResultSchema,
      RESEARCH_COMMANDS.importAttachment,
      input,
    ),
  deleteAttachment: (input) =>
    invokeCommand(
      RESEARCH_IPC_CHANNELS.deleteAttachment,
      ResearchDeleteAttachmentCommandSchema,
      ResearchCatalogResultSchema,
      RESEARCH_COMMANDS.deleteAttachment,
      input,
    ),
  addLink: (input) =>
    invokeCommand(
      RESEARCH_IPC_CHANNELS.addLink,
      ResearchAddLinkCommandSchema,
      ResearchCatalogResultSchema,
      RESEARCH_COMMANDS.addLink,
      input,
    ),
  removeLink: (input) =>
    invokeCommand(
      RESEARCH_IPC_CHANNELS.removeLink,
      ResearchRemoveLinkCommandSchema,
      ResearchCatalogResultSchema,
      RESEARCH_COMMANDS.removeLink,
      input,
    ),
};

contextBridge.exposeInMainWorld('worldforgeResearch', researchBridge);
