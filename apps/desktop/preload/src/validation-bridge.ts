import {
  PROTOCOL_VERSION,
  VALIDATION_COMMANDS,
  VALIDATION_IPC_CHANNELS,
  StoryCommentAddCommandSchema,
  StoryCommentResolveCommandSchema,
  StoryTodoSaveCommandSchema,
  ValidationCatalogResultSchema,
  ValidationCreateTodoCommandSchema,
  ValidationListCommandSchema,
  ValidationRunRulesCommandSchema,
  ValidationUpdateIssueCommandSchema,
  type CommandResult,
  type StoryCommentAddInput,
  type StoryCommentResolveInput,
  type StoryTodoSaveInput,
  type ValidationCatalog,
  type ValidationCreateTodoInput,
  type ValidationListInput,
  type ValidationRunRulesInput,
  type ValidationUpdateIssueInput,
} from '@worldforge/contracts';
import { contextBridge, ipcRenderer } from 'electron';

interface Parser<Result> {
  parse(input: unknown): Result;
}

async function invoke(
  channel: string,
  commandSchema: Parser<unknown>,
  command: string,
  payload: unknown,
): Promise<CommandResult<ValidationCatalog>> {
  const envelope = commandSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    requestId: globalThis.crypto.randomUUID(),
    command,
    payload,
    sentAt: new Date().toISOString(),
  });
  return ValidationCatalogResultSchema.parse(await ipcRenderer.invoke(channel, envelope));
}

const validationBridge = {
  list: (input: ValidationListInput) =>
    invoke(
      VALIDATION_IPC_CHANNELS.list,
      ValidationListCommandSchema,
      VALIDATION_COMMANDS.list,
      input,
    ),
  runRules: (input: ValidationRunRulesInput) =>
    invoke(
      VALIDATION_IPC_CHANNELS.runRules,
      ValidationRunRulesCommandSchema,
      VALIDATION_COMMANDS.runRules,
      input,
    ),
  updateIssue: (input: ValidationUpdateIssueInput) =>
    invoke(
      VALIDATION_IPC_CHANNELS.updateIssue,
      ValidationUpdateIssueCommandSchema,
      VALIDATION_COMMANDS.updateIssue,
      input,
    ),
  createTodoFromIssue: (input: ValidationCreateTodoInput) =>
    invoke(
      VALIDATION_IPC_CHANNELS.createTodoFromIssue,
      ValidationCreateTodoCommandSchema,
      VALIDATION_COMMANDS.createTodoFromIssue,
      input,
    ),
  saveTodo: (input: StoryTodoSaveInput) =>
    invoke(
      VALIDATION_IPC_CHANNELS.saveTodo,
      StoryTodoSaveCommandSchema,
      VALIDATION_COMMANDS.saveTodo,
      input,
    ),
  addComment: (input: StoryCommentAddInput) =>
    invoke(
      VALIDATION_IPC_CHANNELS.addComment,
      StoryCommentAddCommandSchema,
      VALIDATION_COMMANDS.addComment,
      input,
    ),
  resolveComment: (input: StoryCommentResolveInput) =>
    invoke(
      VALIDATION_IPC_CHANNELS.resolveComment,
      StoryCommentResolveCommandSchema,
      VALIDATION_COMMANDS.resolveComment,
      input,
    ),
} as const;

contextBridge.exposeInMainWorld('worldforgeValidation', validationBridge);
