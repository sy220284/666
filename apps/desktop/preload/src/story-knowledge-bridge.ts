import {
  STORY_KNOWLEDGE_COMMANDS,
  STORY_KNOWLEDGE_IPC_CHANNELS,
  StoryKnowledgeProjectCommandSchema,
  StoryKnowledgeProjectionResultSchema,
  type StoryKnowledgeBridge,
  type StoryKnowledgeProjectionInput,
} from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { invokeCommand } from './bridge-runtime.js';

const storyKnowledgeBridge: StoryKnowledgeBridge = {
  project: (input: StoryKnowledgeProjectionInput) =>
    invokeCommand(
      STORY_KNOWLEDGE_IPC_CHANNELS.project,
      StoryKnowledgeProjectCommandSchema,
      StoryKnowledgeProjectionResultSchema,
      STORY_KNOWLEDGE_COMMANDS.project,
      input,
    ),
};

contextBridge.exposeInMainWorld('worldforgeStoryKnowledge', storyKnowledgeBridge);
