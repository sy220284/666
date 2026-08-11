import {
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
  ValidationExceptionDisableCommandSchema,
  ValidationExceptionRememberCommandSchema,
  type CommandResult,
  type StoryCommentAddInput,
  type StoryCommentResolveInput,
  type StoryTodoSaveInput,
  type ValidationCatalog,
  type ValidationCreateTodoInput,
  type ValidationListInput,
  type ValidationRunRulesInput,
  type ValidationUpdateIssueInput,
  type ValidationExceptionDisableInput,
  type ValidationExceptionRememberInput,
} from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { invokeCommand, type Parser } from './bridge-runtime.js';

function invoke(
  channel: string,
  commandSchema: Parser<unknown>,
  command: string,
  payload: unknown,
): Promise<CommandResult<ValidationCatalog>> {
  return invokeCommand(channel, commandSchema, ValidationCatalogResultSchema, command, payload);
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
  rememberException: (input: ValidationExceptionRememberInput) =>
    invoke(
      VALIDATION_IPC_CHANNELS.rememberException,
      ValidationExceptionRememberCommandSchema,
      VALIDATION_COMMANDS.rememberException,
      input,
    ),
  disableException: (input: ValidationExceptionDisableInput) =>
    invoke(
      VALIDATION_IPC_CHANNELS.disableException,
      ValidationExceptionDisableCommandSchema,
      VALIDATION_COMMANDS.disableException,
      input,
    ),
} as const;

contextBridge.exposeInMainWorld('worldforgeValidation', validationBridge);
