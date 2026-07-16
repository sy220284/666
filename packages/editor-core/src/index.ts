export const editorCoreLayer = {
  name: '@worldforge/editor-core',
  responsibility: 'editor-schema-patches-and-locking',
} as const;

export * from './candidate-diff.js';
export * from './character-diff.js';
export * from './draft-document.js';
