import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const outputRoot = 'test-results/unit/prettier-tool';
const entryPath = path.join(outputRoot, 'entry.mjs');
const bundlePath = path.join(outputRoot, 'prettier-offline.mjs');

const entry = `
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import prettier from 'prettier/standalone';
import angular from 'prettier/plugins/angular';
import babel from 'prettier/plugins/babel';
import estree from 'prettier/plugins/estree';
import flow from 'prettier/plugins/flow';
import glimmer from 'prettier/plugins/glimmer';
import graphql from 'prettier/plugins/graphql';
import html from 'prettier/plugins/html';
import markdown from 'prettier/plugins/markdown';
import meriyah from 'prettier/plugins/meriyah';
import postcss from 'prettier/plugins/postcss';
import typescript from 'prettier/plugins/typescript';
import yaml from 'prettier/plugins/yaml';

const plugins = [
  angular,
  babel,
  estree,
  flow,
  glimmer,
  graphql,
  html,
  markdown,
  meriyah,
  postcss,
  typescript,
  yaml,
];

function usage() {
  console.error('用法: node prettier-offline.mjs <文件> [--check]');
  process.exitCode = 2;
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const file = args.find((argument) => argument !== '--check');
if (!file) {
  usage();
} else {
  const source = await readFile(file, 'utf8');
  const formatted = await prettier.format(source, {
    filepath: path.resolve(file),
    plugins,
    printWidth: 100,
    singleQuote: true,
    trailingComma: 'all',
  });
  if (check) {
    if (formatted !== source) {
      console.error('[warn] ' + file);
      process.exitCode = 1;
    } else {
      console.log('[ok] ' + file);
    }
  } else {
    await writeFile(file, formatted, 'utf8');
    console.log('[formatted] ' + file);
  }
}
`;

describe('temporary Prettier tool extraction', () => {
  it('bundles the installed Prettier 3.9.5 runtime into one offline file', async () => {
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
    await writeFile(entryPath, entry, 'utf8');
    await build({
      entryPoints: [entryPath],
      outfile: bundlePath,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      legalComments: 'inline',
      minify: false,
      sourcemap: false,
    });
    await chmod(bundlePath, 0o755);
    await writeFile(
      path.join(outputRoot, 'README.txt'),
      [
        'Prettier 3.9.5 离线单文件工具',
        '',
        '格式化：node prettier-offline.mjs <文件>',
        '检查：node prettier-offline.mjs <文件> --check',
        '',
        '固定仓库配置：printWidth=100, singleQuote=true, trailingComma=all',
        '运行要求：Node.js 22及以上。',
        '',
      ].join('\n'),
      'utf8',
    );
    const packageJson = JSON.parse(await readFile('node_modules/prettier/package.json', 'utf8')) as {
      version?: string;
    };
    expect(packageJson.version).toBe('3.9.5');
    expect.fail('PRETTIER_TOOL_ARTIFACT_READY');
  });
});
