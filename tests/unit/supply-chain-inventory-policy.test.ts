import { describe, expect, it } from 'vitest';

import {
  canonicalSbomSha256,
  normalizeLicenseInventory,
  validateCycloneDxSbom,
  validateSupplyChainPolicy,
} from '../../scripts/supply-chain-inventory.mjs';

const policy = {
  schemaVersion: 1,
  status: 'enforced',
  sbom: {
    format: 'cyclonedx',
    specVersion: '1.7',
    componentType: 'application',
    includeDevelopmentDependencies: true,
    output: 'test-results/security/supply-chain/worldforge.cdx.json',
  },
  licenses: {
    sourceCommand: 'pnpm licenses list --json',
    includeDevelopmentDependencies: true,
    output: 'test-results/security/supply-chain/license-inventory.json',
    rejectedGroups: ['', 'Unknown', 'UNLICENSED', 'undefined', 'null'],
  },
  summaryOutput: 'test-results/security/supply-chain/supply-chain-summary.json',
};

function validSbom() {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.7',
    serialNumber: 'urn:uuid:first',
    metadata: {
      timestamp: '2026-08-12T00:00:00.000Z',
      component: {
        type: 'application',
        name: 'worldforge',
        version: '1.0.0',
        'bom-ref': 'pkg:npm/worldforge@1.0.0',
      },
    },
    components: [{ name: 'foo', version: '1.0.0', 'bom-ref': 'pkg:npm/foo@1.0.0' }],
    dependencies: [
      { ref: 'pkg:npm/worldforge@1.0.0', dependsOn: ['pkg:npm/foo@1.0.0'] },
      { ref: 'pkg:npm/foo@1.0.0', dependsOn: [] },
    ],
  };
}

describe('Phase 4 supply-chain inventory policy', () => {
  it('accepts the enforced CycloneDX 1.7 full-workspace policy', () => {
    expect(validateSupplyChainPolicy(policy)).toEqual([]);
  });

  it('validates the canonical WorldForge CycloneDX root and dependency graph', () => {
    expect(
      validateCycloneDxSbom(validSbom(), { name: 'worldforge', version: '1.0.0' }, policy),
    ).toEqual([]);
  });

  it('keeps the canonical SBOM digest stable across generated UUID and timestamp changes', () => {
    const first = validSbom();
    const second = structuredClone(first);
    second.serialNumber = 'urn:uuid:second';
    second.metadata.timestamp = '2026-08-13T00:00:00.000Z';

    expect(canonicalSbomSha256(second)).toBe(canonicalSbomSha256(first));
  });

  it('normalizes license inventory deterministically without runner-local paths', () => {
    const result = normalizeLicenseInventory(
      {
        MIT: [
          {
            name: 'foo',
            versions: ['1.0.0', '2.0.0'],
            paths: ['/home/runner/work/node_modules/foo'],
            license: 'MIT',
          },
        ],
      },
      policy,
    );

    expect(result.errors).toEqual([]);
    expect(result.document.licenses[0]?.packages[0]).toEqual({
      name: 'foo',
      versions: ['1.0.0', '2.0.0'],
      license: 'MIT',
    });
  });

  it.each(['Unknown', 'UNLICENSED'])('rejects unresolved license group %s', (license) => {
    const result = normalizeLicenseInventory(
      {
        [license]: [{ name: 'unsafe-package', versions: ['1.0.0'], license }],
      },
      policy,
    );
    expect(result.errors).toContain(`Rejected or unknown license group: ${license}`);
  });
});
