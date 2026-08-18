import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { it } from 'vitest';

it('reports exact M12 checks formatter drift', async () => {
  const sourceUrl = new URL(
    '../../apps/desktop/renderer/src/features/checks/checks-workbench.tsx',
    import.meta.url,
  );
  const source = await readFile(sourceUrl, 'utf8');
  const formatted = await format(source, {
    parser: 'typescript',
    printWidth: 100,
    singleQuote: true,
    trailingComma: 'all',
  });
  if (source === formatted) return;

  let prefix = 0;
  while (prefix < source.length && source[prefix] === formatted[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < source.length - prefix &&
    suffix < formatted.length - prefix &&
    source[source.length - 1 - suffix] === formatted[formatted.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  throw new Error(
    `M12_FORMAT_DIAGNOSTIC prefix=${prefix} suffix=${suffix}\nCURRENT:\n${source.slice(prefix, source.length - suffix)}\nEXPECTED:\n${formatted.slice(prefix, formatted.length - suffix)}`,
  );
});
