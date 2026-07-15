export const testkitLayer = {
  name: '@worldforge/testkit',
  responsibility: 'fixtures-stubs-and-fault-injection',
} as const;

export interface MigrationFaultTarget {
  readonly version: number;
  readonly stage: string;
}

export function failMigrationAt(target: MigrationFaultTarget) {
  return (context: MigrationFaultTarget): void => {
    if (context.version === target.version && context.stage === target.stage) {
      throw new Error(`FAULT_INJECTED_MIGRATION_${target.version}_${target.stage}`);
    }
  };
}
