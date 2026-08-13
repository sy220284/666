import { describe, expect, it } from 'vitest';

import {
  prCommitRangeArguments,
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
    const databaseUrl = ['postgres://writer', 's3cr3t-value@localhost/worldforge'].join(':');
    expect(scanSecretLine(`DATABASE_URL="${databaseUrl}"`)).toContain(
      'Credential-bearing database URL',
    );

    const secret = ['Ab9+/', 'kLm2_', 'Np7!Q', 'r4-St8', '=Uv6'].join('');
    expect(scanSecretLine(`client_secret="${secret}"`)).toContain(
      'High-entropy assigned credential',
    );
  });

  it('ignores placeholders and explicit reviewed allowlist lines', () => {
    expect(scanSecretLine('api_key="replace-me-with-your-api-key"')).toEqual([]);
    expect(scanSecretLine(`token="${'Ab9_'.repeat(8)}" # secret-scan: allow`)).toEqual([]);
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

  it('scans every PR commit so a secret added and later removed is still detected', () => {
    const key = `AIza${'C3d4_-'.repeat(6).slice(0, 35)}`;
    const findings = scanGitPatchLines([
      'commit:add-secret',
      'diff --git a/config.ts b/config.ts',
      '+++ b/config.ts',
      '@@ -0,0 +1,1 @@',
      `+const key = "${key}";`,
      'commit:remove-secret',
      'diff --git a/config.ts b/config.ts',
      '+++ b/config.ts',
      '@@ -1,1 +0,0 @@',
      `-const key = "${key}";`,
    ]);

    expect(findings).toEqual([
      { commit: 'add-secret', file: 'config.ts', line: 1, label: 'Google API key' },
    ]);
  });

  it('uses a commit-history range rather than a final net diff for Ready PR scans', () => {
    const args = prCommitRangeArguments('abcdef0');
    expect(args.slice(0, 2)).toEqual(['log', 'abcdef0..HEAD']);
    expect(args).toContain('--format=commit:%H');
    expect(args).toContain('-p');
    expect(args).not.toContain('diff');
  });
});
