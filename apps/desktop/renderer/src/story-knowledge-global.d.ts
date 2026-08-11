import type { StoryKnowledgeBridge } from '@worldforge/contracts';

declare global {
  interface Window {
    readonly worldforgeStoryKnowledge: StoryKnowledgeBridge;
  }
}

export {};
