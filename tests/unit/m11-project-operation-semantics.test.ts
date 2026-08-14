import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_COMMANDS,
  CONTINUITY_COMMANDS,
  DRAFT_COMMANDS,
  ENTITY_CANON_COMMANDS,
  IDEA_CAPSULE_COMMANDS,
  LONGFORM_AI_COMMANDS,
  NARRATIVE_PLANNING_COMMANDS,
  PROJECT_PLANNING_COMMANDS,
  PROJECT_STRUCTURE_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  RECOVERY_COMMANDS,
  RESEARCH_COMMANDS,
  RHYTHM_COMMANDS,
  SCENE_BEAT_COMMANDS,
  SEARCH_TOOLS_COMMANDS,
  STATE_PROPOSAL_COMMANDS,
  STORY_KNOWLEDGE_COMMANDS,
  TEXT_IO_COMMANDS,
  VALIDATION_COMMANDS,
  VERSION_COMMANDS,
} from '@worldforge/contracts';
import {
  PROJECT_OPERATION_SEMANTICS,
  projectOperationKind,
} from '../../apps/desktop/main/src/project-operation-semantics.js';

const commandGroups = [
  PROJECT_WORKSPACE_COMMANDS,
  PROJECT_STRUCTURE_COMMANDS,
  PROJECT_PLANNING_COMMANDS,
  SCENE_BEAT_COMMANDS,
  ENTITY_CANON_COMMANDS,
  CONTINUITY_COMMANDS,
  NARRATIVE_PLANNING_COMMANDS,
  STATE_PROPOSAL_COMMANDS,
  VALIDATION_COMMANDS,
  SEARCH_TOOLS_COMMANDS,
  RHYTHM_COMMANDS,
  STORY_KNOWLEDGE_COMMANDS,
  IDEA_CAPSULE_COMMANDS,
  LONGFORM_AI_COMMANDS,
  RESEARCH_COMMANDS,
  DRAFT_COMMANDS,
  CANDIDATE_COMMANDS,
  CANDIDATE_APPLY_COMMANDS,
  VERSION_COMMANDS,
  RECOVERY_COMMANDS,
  TEXT_IO_COMMANDS,
] as const;

describe('M11 Project Operation Semantics', () => {
  it('contains exactly one semantics entry for every project operation command', () => {
    const operations = commandGroups.flatMap((group) => Object.values(group)).sort();
    const semantics = Object.keys(PROJECT_OPERATION_SEMANTICS).sort();
    expect(semantics).toEqual(operations);
  });

  it('classifies representative read and write operations from every post-M11 domain', () => {
    expect(projectOperationKind(CONTINUITY_COMMANDS.list)).toBe('query');
    expect(projectOperationKind(CONTINUITY_COMMANDS.setCharacterRelationship)).toBe('mutation');
    expect(projectOperationKind(NARRATIVE_PLANNING_COMMANDS.list)).toBe('query');
    expect(projectOperationKind(NARRATIVE_PLANNING_COMMANDS.saveForeshadowing)).toBe('mutation');
    expect(projectOperationKind(STATE_PROPOSAL_COMMANDS.readSnapshot)).toBe('query');
    expect(projectOperationKind(STATE_PROPOSAL_COMMANDS.resolve)).toBe('mutation');
    expect(projectOperationKind(VALIDATION_COMMANDS.list)).toBe('query');
    expect(projectOperationKind(VALIDATION_COMMANDS.rememberException)).toBe('mutation');
    expect(projectOperationKind(SEARCH_TOOLS_COMMANDS.search)).toBe('query');
    expect(projectOperationKind(SEARCH_TOOLS_COMMANDS.previewReplace)).toBe('mutation');
    expect(projectOperationKind(RHYTHM_COMMANDS.get)).toBe('query');
    expect(projectOperationKind(RHYTHM_COMMANDS.run)).toBe('mutation');
    expect(projectOperationKind(STORY_KNOWLEDGE_COMMANDS.project)).toBe('query');
    expect(projectOperationKind(IDEA_CAPSULE_COMMANDS.list)).toBe('query');
    expect(projectOperationKind(IDEA_CAPSULE_COMMANDS.applyConversion)).toBe('mutation');
    expect(projectOperationKind(RESEARCH_COMMANDS.list)).toBe('query');
    expect(projectOperationKind(RESEARCH_COMMANDS.createNote)).toBe('mutation');
  });

  it('does not default unknown read-like candidate operations to mutation semantics', () => {
    expect(projectOperationKind(CANDIDATE_APPLY_COMMANDS.findUndoRecord)).toBe('query');
    expect(projectOperationKind(CANDIDATE_APPLY_COMMANDS.previewUndo)).toBe('query');
  });
});