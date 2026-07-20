import { readFileSync, writeFileSync } from 'node:fs';

function replace(path, oldValue, newValue, expectedCount = 1) {
  const content = readFileSync(path, 'utf8');
  const actualCount = content.split(oldValue).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(
      `${path}: expected ${expectedCount} occurrence(s), found ${actualCount}: ${JSON.stringify(oldValue)}`,
    );
  }
  writeFileSync(path, content.replace(oldValue, newValue), 'utf8');
}

replace(
  'apps/desktop/main/src/candidate-preview-ipc.ts',
  "import { registerContinuityIpc } from './continuity-ipc.js';\n",
  '',
);
replace(
  'apps/desktop/main/src/candidate-preview-ipc.ts',
  '  const unregisterContinuityIpc = registerContinuityIpc(options);\n',
  '',
);
replace(
  'apps/desktop/main/src/candidate-preview-ipc.ts',
  '    unregisterContinuityIpc();\n',
  '',
);

const candidateDescribe = "describe('Candidate Preview IPC authority boundary', () => {\n";
const candidateRegression = [
  "describe('Candidate Preview IPC authority boundary', () => {",
  "  it('registers only Candidate channels and leaves continuity composition to Electron main', () => {",
  '    const { handlers } = register();',
  '    expect([...handlers.keys()].sort()).toEqual(',
  '      Object.values(CANDIDATE_APPLY_IPC_CHANNELS).sort(),',
  '    );',
  '  });',
  '',
].join('\n');
replace('tests/security/candidate-preview-ipc.test.ts', candidateDescribe, candidateRegression);

replace('tests/migration/project-planning-migration.test.ts', 'toBe(13)', 'toBe(14)');
replace(
  'tests/migration/project-planning-migration.test.ts',
  'schema_version: 13n',
  'schema_version: 14n',
);
replace('tests/migration/recovery-migration.test.ts', 'schemaVersion: 13', 'schemaVersion: 14');
replace(
  'tests/migration/scene-beat-migration.test.ts',
  'project schema version 13',
  'project schema version 14',
);
replace('tests/migration/scene-beat-migration.test.ts', 'toBe(13)', 'toBe(14)');
replace(
  'tests/migration/testkit-faults.test.ts',
  'projectDatabase.schemaVersion).toBe(13)',
  'projectDatabase.schemaVersion).toBe(14)',
);

replace(
  'tests/migration/sqlite-foundation.test.ts',
  "    ).toEqual([\n      'backup_records',",
  "    ).toEqual([\n      'arc_milestone_dependencies',\n      'arc_milestone_timeline_dependencies',\n      'arc_milestones',\n      'backup_records',",
);
replace(
  'tests/migration/sqlite-foundation.test.ts',
  "      'canon_facts',\n      'chapters',",
  "      'canon_facts',\n      'character_arcs',\n      'chapters',",
);
replace(
  'tests/migration/sqlite-foundation.test.ts',
  "      'entity_states',\n      'knowledge_states',",
  "      'entity_states',\n      'foreshadowing_chapters',\n      'foreshadowing_relations',\n      'foreshadowings',\n      'knowledge_states',",
);

replace(
  'tests/integration/narrative-foreshadowing.test.ts',
  "      expect(search.foreshadowings.map((item) => item.title)).toEqual(['旧钥匙']);",
  "      expect(search.foreshadowings.map((item) => item.title)).toEqual(['旧钥匙', '密室真相']);",
);
replace(
  'tests/integration/narrative-character-arc.test.ts',
  '    const harness = await createContinuityHarness();\n    try {\n      const seeded = await seedContinuity(harness);\n      const foreign = await seedContinuity(harness);',
  '    const harness = await createContinuityHarness();\n    const foreignHarness = await createContinuityHarness();\n    try {\n      const seeded = await seedContinuity(harness);\n      const foreign = await seedContinuity(foreignHarness);',
);
replace(
  'tests/integration/narrative-character-arc.test.ts',
  '      const foreignEventCatalog = await harness.continuity.saveTimelineEvent(',
  '      const foreignEventCatalog = await foreignHarness.continuity.saveTimelineEvent(',
);
replace(
  'tests/integration/narrative-character-arc.test.ts',
  '    } finally {\n      await closeContinuityHarness(harness);\n    }\n  });\n});\n',
  '    } finally {\n      await closeContinuityHarness(foreignHarness);\n      await closeContinuityHarness(harness);\n    }\n  });\n});\n',
);
