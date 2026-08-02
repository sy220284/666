import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const output = path.join(process.cwd(), 'test-results/ar11-service-inventory/inventory.json');

describe('AR-11 service boundary inventory', () => {
  it('exports the complete facade and helper inventory for review', async () => {
    execFileSync(process.execPath, ['scripts/generate-ar11-service-inventory.mjs'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    const text = await readFile(output, 'utf8');
    const inventory = JSON.parse(text) as {
      readonly stateProposal: {
        readonly facade: { readonly methods: readonly unknown[] };
        readonly functions: readonly unknown[];
      };
      readonly generation: {
        readonly facade: { readonly methods: readonly unknown[] };
        readonly functions: readonly unknown[];
      };
    };
    expect(inventory.stateProposal.facade.methods.length).toBeGreaterThan(5);
    expect(inventory.stateProposal.functions.length).toBeGreaterThan(10);
    expect(inventory.generation.facade.methods.length).toBeGreaterThan(5);
    expect(inventory.generation.functions.length).toBeGreaterThan(5);
    console.log('===AR11_INVENTORY_BEGIN===');
    console.log(text);
    console.log('===AR11_INVENTORY_END===');
    throw new Error('AR11_SERVICE_INVENTORY_READY');
  });
});
