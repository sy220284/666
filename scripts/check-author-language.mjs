import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const glossaryPath = path.join(root, 'docs/product/AUTHOR_LANGUAGE_GLOSSARY.md');
const governedPath = path.join(root, 'docs/product/AUTHOR_LANGUAGE_GOVERNED_PATHS.json');
const termSourcePath = path.join(root, 'apps/desktop/renderer/src/presentation/author-terms.ts');

const prohibitedBusinessTerms = [
  'Candidate',
  'Draft',
  'Provider',
  'GenerationRun',
  'StateProposal',
  'ReplacePlan',
  'Revision',
  'Schema',
  'UUID',
  'Renderer',
  'Core',
  'Validation',
  'SceneBeat',
  'Version',
  'Evidence',
  'Fixture',
];

const requiredTerms = {
  draft: '当前稿',
  version: '历史版本',
  finalVersion: '定稿版本',
  candidate: '建议稿',
  provider: 'AI连接',
  stateProposal: '设定更新建议',
  validation: '作品检查',
  validationIssue: '检查问题',
  sceneBeat: '场景节拍',
  replacePlan: '替换预览',
  recoveryCenter: '恢复中心',
  core: '本地服务',
  renderer: '应用界面',
  beginnerMode: '简明模式',
  professionalMode: '完整模式',
  focusMode: '沉浸写作',
  testEvidence: '验证记录',
};

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.html', '.md']);

function normalize(value) {
  return value.replaceAll('\\', '/');
}

async function collectFiles(target) {
  const absolute = path.resolve(root, target);
  const targetStat = await stat(absolute);
  if (targetStat.isFile()) return [absolute];

  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectFiles(path.relative(root, path.join(absolute, entry.name)))),
  );
  return nested.flat();
}

function stripMarkdownCode(source) {
  return source.replace(/```[\s\S]*?```/gu, '').replace(/`[^`\r\n]+`/gu, '');
}

function sourceStringLiterals(source) {
  const literals = [];
  const pattern = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/gu;
  for (const match of source.matchAll(pattern)) {
    const value = match[2] ?? '';
    if (/^(?:\.{0,2}\/|@|node:)/u.test(value)) continue;
    literals.push(value);
  }
  return literals.join('\n');
}

function scanText(file, source) {
  const extension = path.extname(file);
  const searchable = extension === '.md' ? stripMarkdownCode(source) : sourceStringLiterals(source);
  const violations = [];

  for (const term of prohibitedBusinessTerms) {
    const matcher = new RegExp(`\\b${term}\\b`, 'u');
    if (matcher.test(searchable)) {
      violations.push(`${normalize(path.relative(root, file))}: 作者可见文本包含内部名称 ${term}`);
    }
  }
  return violations;
}

async function main() {
  const [glossary, governedSource, termSource] = await Promise.all([
    readFile(glossaryPath, 'utf8'),
    readFile(governedPath, 'utf8'),
    readFile(termSourcePath, 'utf8'),
  ]);
  const governed = JSON.parse(governedSource);
  if (governed.schemaVersion !== 1 || !Array.isArray(governed.paths)) {
    throw new Error('正式中文名称受控路径清单格式无效');
  }

  const errors = [];
  for (const [key, label] of Object.entries(requiredTerms)) {
    const sourceMatcher = new RegExp(`\\b${key}:\\s*'${label}'`, 'u');
    if (!sourceMatcher.test(termSource)) {
      errors.push(`正式名称映射缺少 ${key} → ${label}`);
    }
    if (!glossary.includes(label)) {
      errors.push(`术语表缺少正式名称：${label}`);
    }
  }

  const excluded = new Set((governed.excludedPaths ?? []).map(normalize));
  const files = (await Promise.all(governed.paths.map((target) => collectFiles(target))))
    .flat()
    .filter((file) => sourceExtensions.has(path.extname(file)))
    .filter((file) => !excluded.has(normalize(path.relative(root, file))));

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    errors.push(...scanText(file, source));
  }

  if (errors.length > 0) {
    console.error('正式中文名称检查失败：');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`正式中文名称检查通过：${files.length}个受控文件。`);
}

await main();
