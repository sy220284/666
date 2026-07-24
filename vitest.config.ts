import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup/restore-global-state.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: { enabled: false },
  },
});
