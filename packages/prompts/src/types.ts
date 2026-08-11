import type {
  ContractSchema,
  PromptMetadata,
  PromptOutputMode,
  PromptTaskType,
} from '@worldforge/contracts';

export interface PromptIdentity<TaskType extends PromptTaskType = PromptTaskType> {
  readonly promptId: string;
  readonly version: number;
  readonly taskType: TaskType;
}

export interface PromptBundle {
  readonly system: string;
  readonly messages: readonly {
    readonly role: 'user' | 'assistant';
    readonly content: string;
  }[];
  readonly structuredOutput?: {
    readonly name: string;
    readonly schema: Readonly<Record<string, unknown>>;
  };
  readonly metadata: PromptMetadata;
}

export interface PromptDefinition<Input, Output> {
  readonly identity: PromptIdentity;
  readonly promptId: string;
  readonly version: number;
  readonly taskType: PromptTaskType;
  readonly inputSchema: ContractSchema<Input>;
  readonly outputSchema: ContractSchema<Output>;
  readonly supportedModes: readonly PromptOutputMode[];
  build(input: Input): PromptBundle;
}

export type PromptDefinitionBody<Input, Output> = Omit<
  PromptDefinition<Input, Output>,
  'identity' | 'promptId' | 'version' | 'taskType'
>;

export function definePrompt<Input, Output>(
  identity: PromptIdentity,
  body: PromptDefinitionBody<Input, Output>,
): PromptDefinition<Input, Output> {
  return {
    identity,
    promptId: identity.promptId,
    version: identity.version,
    taskType: identity.taskType,
    ...body,
  };
}

export function promptMetadata(
  identity: PromptIdentity,
  constraintHash: string,
): PromptMetadata {
  return {
    promptId: identity.promptId,
    promptVersion: identity.version,
    taskType: identity.taskType,
    constraintHash,
  };
}

export function withPromptIdentity(
  identity: PromptIdentity,
  constraintHash: string,
  bundle: Omit<PromptBundle, 'metadata'>,
): PromptBundle {
  return {
    ...bundle,
    metadata: promptMetadata(identity, constraintHash),
  };
}
