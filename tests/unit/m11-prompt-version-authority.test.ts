import { describe, expect, it } from 'vitest';

import {
  STATE_EXTRACT_PROMPT_ID,
  VALIDATE_PROMPT_ID,
  getPromptDefinition,
  listPromptVersions,
  promptRegistry,
  stateExtractPrompt,
  stateExtractPromptV1,
  validatePrompt,
  validatePromptV1,
} from '../../packages/prompts/src/registry.js';
import { withPromptIdentity } from '../../packages/prompts/src/types.js';

const hash = 'a'.repeat(64);
const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const validationInput = {
  constraintHash: hash,
  constraintContext: 'P0：权威设定',
  versionId: id('1'),
  blocks: [{ logicalBlockId: id('2'), content: '正文。' }],
};
const extractionInput = {
  constraintHash: hash,
  constraintContext: 'P0：权威设定',
  finalVersionId: id('3'),
  blocks: [{ logicalBlockId: id('4'), content: '人物受伤。' }],
};

describe('M11 Prompt Version Authority', () => {
  it('registers every prompt identity exactly once', () => {
    const keys = promptRegistry.map(
      (definition) => `${definition.identity.promptId}@${definition.identity.version}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const definition of promptRegistry) {
      expect(definition.promptId).toBe(definition.identity.promptId);
      expect(definition.version).toBe(definition.identity.version);
      expect(definition.taskType).toBe(definition.identity.taskType);
    }
  });

  it('keeps pre-M11-03 validation and state extraction versions resolvable', () => {
    expect(listPromptVersions(VALIDATE_PROMPT_ID)).toEqual([1, 2]);
    expect(listPromptVersions(STATE_EXTRACT_PROMPT_ID)).toEqual([1, 2]);
    expect(getPromptDefinition(VALIDATE_PROMPT_ID, 1)).toBe(validatePromptV1);
    expect(getPromptDefinition(VALIDATE_PROMPT_ID, 2)).toBe(validatePrompt);
    expect(getPromptDefinition(STATE_EXTRACT_PROMPT_ID, 1)).toBe(stateExtractPromptV1);
    expect(getPromptDefinition(STATE_EXTRACT_PROMPT_ID, 2)).toBe(stateExtractPrompt);
    expect(validatePromptV1.build(validationInput).system).not.toBe(
      validatePrompt.build(validationInput).system,
    );
    expect(stateExtractPromptV1.build(extractionInput).system).not.toBe(
      stateExtractPrompt.build(extractionInput).system,
    );
    expect(validatePrompt.version).toBe(2);
    expect(stateExtractPrompt.version).toBe(2);
  });

  it('derives bundle metadata from the same identity as the definition', () => {
    const validateBundle = validatePrompt.build(validationInput);
    expect(validateBundle.metadata).toEqual({
      promptId: validatePrompt.identity.promptId,
      promptVersion: validatePrompt.identity.version,
      taskType: validatePrompt.identity.taskType,
      constraintHash: hash,
    });

    const extractionBundle = stateExtractPrompt.build(extractionInput);
    expect(extractionBundle.metadata).toEqual({
      promptId: stateExtractPrompt.identity.promptId,
      promptVersion: stateExtractPrompt.identity.version,
      taskType: stateExtractPrompt.identity.taskType,
      constraintHash: hash,
    });
  });

  it('fails closed for unknown prompt versions and derives metadata without a second version field', () => {
    expect(() => getPromptDefinition(VALIDATE_PROMPT_ID, 3)).toThrow(
      `Unknown prompt version: ${VALIDATE_PROMPT_ID}@3`,
    );
    expect(() => getPromptDefinition('unknown.prompt', 1)).toThrow('Unknown prompt');

    const metadata = withPromptIdentity(validatePrompt.identity, hash, {
      system: 'test',
      messages: [{ role: 'user', content: 'test' }],
    }).metadata;
    expect(metadata.promptVersion).toBe(validatePrompt.version);
  });
});
