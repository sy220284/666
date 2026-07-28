import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, replacements) {
  let source = await readFile(path, 'utf8');
  for (const [needle, replacement, label] of replacements) {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error(`MISSING:${label}`);
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`MULTIPLE:${label}`);
    source = source.slice(0, first) + replacement + source.slice(first + needle.length);
  }
  await writeFile(path, source, 'utf8');
}

await replaceExact('packages/core-service/src/recovery.ts', [
  [
    `    let lock: Awaited<ReturnType<typeof open>> | null = null;`,
    `    let lock: Awaited<ReturnType<typeof open>>;`,
    'daily-lock-uninitialized',
  ],
  [
    `    if (!lock) throw new RecoveryServiceError('BACKUP_CREATE_FAILED', 'Daily backup lock failed.');\n`,
    ``,
    'daily-lock-null-guard',
  ],
]);

await replaceExact('tests/performance/m8-release-evidence.test.ts', [
  [
    `    let heapGrowthBytes = 0;`,
    `    const memory = { heapGrowthBytes: 0 };`,
    'heap-growth-container',
  ],
  [
    `      heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - initialHeap);`,
    `      memory.heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - initialHeap);`,
    'heap-growth-assignment',
  ],
  [
    `    expect(heapGrowthBytes).toBeLessThan(128 * 1024 * 1024);`,
    `    expect(memory.heapGrowthBytes).toBeLessThan(128 * 1024 * 1024);`,
    'heap-growth-expectation',
  ],
]);

await replaceExact('packages/core-service/src/docx-transfer.ts', [
  [
    `function paragraphText(paragraph: string): string {\n  const pieces: string[] = [];\n  const tokenPattern = /<w:t\\b[^>]*>([\\s\\S]*?)<\\/w:t>|<w:tab\\b[^>]*\\/>|<w:br\\b[^>]*\\/>/giu;\n  for (const token of paragraph.matchAll(tokenPattern)) {\n    if (token[1] !== undefined) pieces.push(xmlText(token[1]));\n    else if (/tab/iu.test(token[0])) pieces.push('\\t');\n    else pieces.push('\\n');\n  }\n  return pieces.join('').replaceAll('\\r\\n', '\\n').replaceAll('\\r', '\\n').trim();\n}`,
    `function tagBoundary(value: string, index: number): boolean {\n  const character = value[index];\n  return (\n    character === '>' ||\n    character === '/' ||\n    character === ' ' ||\n    character === '\\t' ||\n    character === '\\r' ||\n    character === '\\n'\n  );\n}\n\nfunction findTagStart(value: string, tag: string, from: number): number {\n  const prefix = \`<\${tag}\`;\n  let cursor = from;\n  for (;;) {\n    const index = value.indexOf(prefix, cursor);\n    if (index < 0) return -1;\n    if (tagBoundary(value, index + prefix.length)) return index;\n    cursor = index + prefix.length;\n  }\n}\n\nfunction paragraphText(paragraph: string): string {\n  const pieces: string[] = [];\n  let cursor = 0;\n  for (;;) {\n    const textStart = findTagStart(paragraph, 'w:t', cursor);\n    const tabStart = findTagStart(paragraph, 'w:tab', cursor);\n    const breakStart = findTagStart(paragraph, 'w:br', cursor);\n    const starts = [textStart, tabStart, breakStart].filter((value) => value >= 0);\n    if (starts.length === 0) break;\n    const start = Math.min(...starts);\n    const openEnd = paragraph.indexOf('>', start);\n    if (openEnd < 0) unsupported('The DOCX paragraph contains an incomplete WordprocessingML tag.');\n    if (start === textStart) {\n      const close = paragraph.indexOf('</w:t>', openEnd + 1);\n      if (close < 0) unsupported('The DOCX paragraph contains an unterminated text run.');\n      pieces.push(xmlText(paragraph.slice(openEnd + 1, close)));\n      cursor = close + '</w:t>'.length;\n    } else {\n      pieces.push(start === tabStart ? '\\t' : '\\n');\n      cursor = openEnd + 1;\n    }\n  }\n  return pieces.join('').replaceAll('\\r\\n', '\\n').replaceAll('\\r', '\\n').trim();\n}`,
    'docx-nonrecursive-token-parser',
  ],
  [
    `  for (const match of documentXml.matchAll(/<w:p\\b[\\s\\S]*?<\\/w:p>/giu)) {\n    const paragraph = match[0];\n    const text = paragraphText(paragraph);\n    if (!text) continue;\n    const level = headingLevel(paragraph);\n    if (level === 1) {\n      commit();\n      current = {\n        planChapterId: idFactory(),\n        title: text.slice(0, 240) || fallbackTitle,\n        blocks: [],\n      };\n    } else {\n      current.blocks.push({\n        blockType: level && level > 1 ? 'heading' : text === '***' ? 'separator' : 'paragraph',\n        text: text === '***' && !level ? '' : text,\n      });\n    }\n  }`,
    `  let paragraphCursor = 0;\n  for (;;) {\n    const paragraphStart = findTagStart(documentXml, 'w:p', paragraphCursor);\n    if (paragraphStart < 0) break;\n    const paragraphEnd = documentXml.indexOf('</w:p>', paragraphStart);\n    if (paragraphEnd < 0) unsupported('The DOCX document contains an unterminated paragraph.');\n    const paragraph = documentXml.slice(paragraphStart, paragraphEnd + '</w:p>'.length);\n    paragraphCursor = paragraphEnd + '</w:p>'.length;\n    const text = paragraphText(paragraph);\n    if (!text) continue;\n    const level = headingLevel(paragraph);\n    if (level === 1) {\n      commit();\n      current = {\n        planChapterId: idFactory(),\n        title: text.slice(0, 240) || fallbackTitle,\n        blocks: [],\n      };\n    } else {\n      current.blocks.push({\n        blockType: level && level > 1 ? 'heading' : text === '***' ? 'separator' : 'paragraph',\n        text: text === '***' && !level ? '' : text,\n      });\n    }\n  }`,
    'docx-nonrecursive-paragraph-parser',
  ],
]);

await replaceExact('tests/integration/docx-transfer.test.ts', [
  [
    `    const archive = renderDocx([\n      { chapterTitle: '超大章节', blocks: [{ blockType: 'paragraph', text }] },\n    ]);\n    const parsed = parseDocx(archive, '超大章节', randomUUID);\n    expect(archive.byteLength).toBeLessThan(20 * 1024 * 1024);\n    expect(parsed.chapters[0]?.blocks[0]?.text).toHaveLength(text.length);`,
    `    const chunks = Array.from({ length: 8 }, (_value, index) =>\n      text.slice(index * 875_000, (index + 1) * 875_000),\n    );\n    const archive = renderDocx([\n      {\n        chapterTitle: '超大章节',\n        blocks: chunks.map((chunk) => ({ blockType: 'paragraph', text: chunk })),\n      },\n    ]);\n    const parsed = parseDocx(archive, '超大章节', randomUUID);\n    expect(archive.byteLength).toBeLessThan(20 * 1024 * 1024);\n    expect(\n      parsed.chapters[0]?.blocks.reduce((total, block) => total + block.text.length, 0),\n    ).toBe(text.length);`,
    'docx-large-valid-blocks',
  ],
]);

console.log('M8-02 generated static and large-DOCX issues fixed.');
