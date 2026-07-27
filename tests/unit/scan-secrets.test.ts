import { describe, expect, it } from 'vitest';

import {
  scanGitPatchLines,
  scanSecretLine,
  scanSecretText,
} from '../../scripts/scan-secrets.mjs';

describe('secret scanner', () => {
  it('detects provider tokens without exposing their values', () => {
    const openAi = `sk-proj-${'A1b2_'.repeat(8)}`;
    const anthropic = `sk-ant-${'Z9y8-'.repeat(8)}`;
    expect(scanSecretLine(`OPENAI_API_KEY="${openAi}"`)).toContain('OpenAI API key');
    expect(scanSecretLine(`ANTHROPIC_API_KEY="${anthropic}"`)).toContain('Anthropic API key');
  });

  it('detects credential-bearing database URLs and high-entropy assignments', () => {
    expect(scanSecretLine('DATABASE_URL="postgres://writer:s3cr3t-value@localhost/worldforge"')).toContain(
      'Credential-bearing database URL',
    );
    expect(
      scanSecretLine('client_secret="Ab9+/kLm2_Np7!Qr4-St8=Uv6"'),
    ).toContain('High-entropy assigned credential');
  });

  it('ignores placeholders and explicit reviewed allowlist lines', () => {
    expect(scanSecretLine('api_key="replace-me-with-your-api-key"')).toEqual([]);
    expect(
      scanSecretLine(`token="${'Ab9_'.repeat(8)}" # secret-scan: allow`),
    ).toEqual([]);
  });

  it('reports stable line numbers without returning secret values', () => {
    const token = `npm_${'A1b2'.repeat(9)}`;
    const findings = scanSecretText(`safe=true\nNPM_TOKEN="${token}"`);
    expect(findings).toEqual([{ line: 2, label: 'npm access token' }]);
    expect(JSON.stringify(findings)).not.toContain(token);
  });

  it('tracks commit, file and added-line positions in Git patches', () => {
    const key = `AIza${'A1b2_-'.repeat(6).slice(0, 35)}`;
    const findings = scanGitPatchLines([
      'commit:abc123',
      'diff --git a/config.ts b/config.ts',
      '+++ b/config.ts',
      '@@ -0,0 +10,2 @@',
      '+const safe = true;',
      `+const key = "${key}";`,
    ]);
    expect(findings).toEqual([
      { commit: 'abc123', file: 'config.ts', line: 11, label: 'Google API key' },
    ]);
  });
});
