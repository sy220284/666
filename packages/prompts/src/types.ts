import type {
  ContractSchema,
  PromptMetadata,
  PromptOutputMode,
  PromptTaskType,
} from '@worldforge/contracts';

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
  readonly promptId: string;
  readonly version: number;
  readonly taskType: PromptTaskType;
  readonly inputSchema: ContractSchema<Input>;
  readonly outputSchema: ContractSchema<Output>;
  readonly supportedModes: readonly PromptOutputMode[];
  build(input: Input): PromptBundle;
}
