export type DraftSemanticBlockType = 'paragraph' | 'dialogue' | 'heading' | 'separator';

export interface DraftSemanticAttributes {
  readonly headingLevel?: number | undefined;
}

export interface DraftSemanticInput {
  readonly blockType: DraftSemanticBlockType;
  readonly content: string;
  readonly attributes?: DraftSemanticAttributes | undefined;
}

export interface NormalizedDraftSemanticBlock {
  readonly blockType: DraftSemanticBlockType;
  readonly content: string;
  readonly attributes: DraftSemanticAttributes;
}

export function normalizeDraftText(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').normalize('NFC');
}

export function normalizeDraftBlockAttributes(
  blockType: DraftSemanticBlockType,
  attributes: DraftSemanticAttributes = {},
): DraftSemanticAttributes {
  if (blockType === 'heading') {
    const headingLevel = attributes.headingLevel ?? 2;
    if (!Number.isInteger(headingLevel) || headingLevel < 1 || headingLevel > 6) {
      throw new RangeError('Heading blocks require headingLevel between 1 and 6.');
    }
    return { headingLevel };
  }
  if (attributes.headingLevel !== undefined) {
    throw new RangeError('Only heading blocks can declare headingLevel.');
  }
  return {};
}

export function normalizeDraftBlockSemantic(
  input: DraftSemanticInput,
): NormalizedDraftSemanticBlock {
  const content = normalizeDraftText(input.content);
  if (input.blockType === 'separator' && content !== '') {
    throw new RangeError('Separator blocks cannot contain content.');
  }
  return {
    blockType: input.blockType,
    content,
    attributes: normalizeDraftBlockAttributes(input.blockType, input.attributes),
  };
}

export function serializeDraftBlockSemantic(input: DraftSemanticInput): string {
  const normalized = normalizeDraftBlockSemantic(input);
  return JSON.stringify([
    normalized.blockType,
    normalized.content,
    normalized.attributes.headingLevel ?? null,
  ]);
}
