import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

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

const prohibitedAuthorPhrases = new Map([
  ['最近项目', '最近作品'],
  ['项目工作区', '作品目录'],
  ['项目处于', '作品处于'],
  ['项目创建', '作品创建'],
  ['项目打开', '作品打开'],
  ['项目关闭', '作品关闭'],
  ['项目移动', '作品移动'],
  ['项目重新定位', '作品重新定位'],
  ['项目路径', '作品路径'],
  ['项目文件', '作品文件'],
  ['中断候选', '未完成建议稿'],
  ['候选待', '智能建议稿待'],
  ['审阅候选', '审阅智能建议稿'],
  ['作品任务书', '作品核心'],
  ['场景节拍', '场景'],
  ['正文块', '正文段落'],
  ['定稿版本', '定稿'],
  ['设定更新建议', '智能审阅建议'],
  ['状态提案', '智能审阅建议'],
  ['裁决提案', '处理智能审阅建议'],
  ['AI设定建议', '智能审阅建议'],
  ['AI连接', '智能连接'],
  ['AI模型', '智能模型'],
  ['AI任务', '智能生成任务'],
  ['AI建议稿', '智能建议稿'],
  ['AI审阅', '智能审阅'],
  ['作品检查', '内容检查'],
  ['写作待办', '修改任务'],
  ['校验问题', '检查问题'],
]);

const requiredTerms = {
  draft: '当前稿',
  draftBlock: '正文段落',
  version: '历史版本',
  finalVersion: '定稿',
  candidate: '智能建议稿',
  provider: '智能连接',
  generationRun: '智能生成任务',
  projectBrief: '作品核心',
  stateProposal: '智能审阅建议',
  aiReview: '智能审阅',
  reviewProposal: '智能审阅建议',
  validation: '内容检查',
  validationIssue: '检查问题',
  sceneBeat: '场景',
  storyTodo: '修改任务',
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
const syntaxExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

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

function scriptKind(file) {
  const extension = path.extname(file);
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.js' || extension === '.mjs') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isTechnicalDiagnosticLiteral(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isNewExpression(current) &&
      ts.isIdentifier(current.expression) &&
      ['Error', 'TypeError', 'RangeError', 'AggregateError'].includes(current.expression.text)
    ) {
      return true;
    }
    if (ts.isStatement(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

function isModulePathLiteral(node) {
  const parent = node.parent;
  return (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  );
}

function syntaxAuthorText(file, source) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const values = [];
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const value = node.getText(sourceFile).trim();
      if (value) values.push(value);
    } else if (ts.isStringLiteralLike(node)) {
      const value = node.text;
      if (
        !isModulePathLiteral(node) &&
        !isTechnicalDiagnosticLiteral(node) &&
        !/^(?:\.{0,2}\/|@|node:)/u.test(value)
      ) {
        values.push(value);
      }
    } else if (
      (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) &&
      !isTechnicalDiagnosticLiteral(node)
    ) {
      values.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values.join('\n');
}

function rendererAuthorSurface(file) {
  return normalize(path.relative(root, file)).startsWith('apps/desktop/renderer/src/');
}

function scanText(file, source) {
  const extension = path.extname(file);
  const searchable =
    extension === '.md'
      ? stripMarkdownCode(source)
      : syntaxExtensions.has(extension)
        ? syntaxAuthorText(file, source)
        : source;
  const violations = [];
  const relative = normalize(path.relative(root, file));

  for (const term of prohibitedBusinessTerms) {
    const matcher = new RegExp(`\\b${term}\\b`, 'u');
    if (matcher.test(searchable)) {
      violations.push(`${relative}: 作者可见文本包含内部名称 ${term}`);
    }
  }

  if (rendererAuthorSurface(file)) {
    for (const [phrase, replacement] of prohibitedAuthorPhrases) {
      if (searchable.includes(phrase)) {
        violations.push(`${relative}: 作者可见文本包含旧称“${phrase}”，应使用“${replacement}”`);
      }
    }
    if (/\$\{[^}\r\n]*(?:error|failure)\.code[^}\r\n]*\}/u.test(source)) {
      violations.push(`${relative}: 普通作者文本直接插入原始错误码，应移入折叠技术详情`);
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
  const files = [
    ...new Set(
      (await Promise.all(governed.paths.map((target) => collectFiles(target))))
        .flat()
        .filter((file) => sourceExtensions.has(path.extname(file)))
        .filter((file) => !excluded.has(normalize(path.relative(root, file)))),
    ),
  ];

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
