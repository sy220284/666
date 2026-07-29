/* global console */
import { readFile, writeFile } from 'node:fs/promises';

async function patchFile(filePath, patch) {
  const source = await readFile(filePath, 'utf8');
  const updated = patch(source);
  if (updated === source) throw new Error(`${filePath}没有产生预期变更。`);
  await writeFile(filePath, updated, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`${label}缺少预期片段：${before.slice(0, 160)}`);
  return source.replace(before, after);
}

await patchFile('apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx', (input) => {
  let source = input;
  source = replaceRequired(
    source,
    `import { WritingAssistancePanel } from './writing-assistance-panel.js';`,
    `import { WritingAssistancePanel } from './writing-assistance-panel.js';
import { ReviewDiffPanel } from './review-diff-panel.js';
import {
  candidateCompletenessLabel,
  candidateStatusLabel,
  candidateTypeLabel,
  groupCandidatesForReview,
  sceneBeatReviewLabel,
} from './review-diff.js';`,
    '写作审阅导入',
  );

  source = replaceRequired(
    source,
    `        <div className="version-compare-grid">
          <pre>
            <strong>当前稿</strong>
            {'\\n\\n'}
            {draft.blocks.map((block) => block.text).join('\\n\\n')}
          </pre>
          <pre>
            <strong>{selected?.title ?? '选择历史版本比较'}</strong>
            {'\\n\\n'}
            {selected?.blocks.map((block) => block.text).join('\\n\\n') ?? ''}
          </pre>
        </div>`,
    `        <ReviewDiffPanel
          comparisonText={selected?.blocks.map((block) => block.text).join('\\n\\n') ?? ''}
          comparisonTitle={selected?.title ?? '选择历史版本比较'}
          currentText={draft.blocks.map((block) => block.text).join('\\n\\n')}
          currentTitle="当前已保存稿"
          marker="version"
        />`,
    '历史版本差异面板',
  );

  source = replaceRequired(
    source,
    `  const proseCandidates = candidates.filter(
    (candidate) => candidate.candidateType !== 'skeleton' && candidate.status !== 'discarded',
  );`,
    `  const proseCandidates = candidates.filter(
    (candidate) => candidate.candidateType !== 'skeleton' && candidate.status !== 'discarded',
  );
  const reviewGroups = useMemo(() => groupCandidatesForReview(candidates), [candidates]);`,
    '建议稿审阅分组',
  );

  source = replaceRequired(
    source,
    `          {candidates.map((candidate) => (
            <option
              data-status={candidate.status}
              key={candidate.candidateId}
              value={candidate.candidateId}
            >
              {candidate.title} · {candidate.candidateType} · {candidate.completeness} ·{' '}
              {candidate.status}
            </option>
          ))}`,
    `          {reviewGroups.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {group.candidates.map((candidate) => (
                <option
                  data-status={candidate.status}
                  key={candidate.candidateId}
                  value={candidate.candidateId}
                >
                  {candidate.title} · {candidateTypeLabel(candidate.candidateType)} ·{' '}
                  {candidateCompletenessLabel(candidate.completeness)} ·{' '}
                  {candidateStatusLabel(candidate.status)}
                </option>
              ))}
            </optgroup>
          ))}`,
    '建议稿选择分组',
  );

  source = replaceRequired(
    source,
    `          <div className="candidate-compare-grid">
            <pre data-candidate-preview-current>
              <strong>当前已保存稿</strong>
              {'\\n\\n'}
              {preview.draft.blocks.map((block) => block.text).join('\\n\\n')}
            </pre>
            <pre data-candidate-preview-candidate>
              <strong>候选稿</strong>
              {'\\n\\n'}
              {preview.candidate.blocks.map((block) => block.text).join('\\n\\n')}
            </pre>
          </div>`,
    `          <ReviewDiffPanel
            comparisonText={preview.candidate.blocks.map((block) => block.text).join('\\n\\n')}
            comparisonTitle={preview.candidate.title}
            currentText={preview.draft.blocks.map((block) => block.text).join('\\n\\n')}
            currentTitle="当前已保存稿"
            marker="candidate"
          />`,
    '建议稿差异面板',
  );

  source = replaceRequired(
    source,
    `<option value="scene-beats">按SceneBeat</option>`,
    `<option value="scene-beats">按场景节拍</option>`,
    '场景节拍采用名称',
  );
  source = replaceRequired(
    source,
    `                    {beatId}`,
    `                    {sceneBeatReviewLabel(sceneBeats, beatId)}`,
    '场景节拍选择名称',
  );

  for (const [before, after] of [
    [`{candidate.title} · {candidate.candidateType}`, `{candidate.title} · {candidateTypeLabel(candidate.candidateType)}`],
    [
      `{candidate.title} · {candidate.candidateType} · {candidate.completeness}`,
      `{candidate.title} · {candidateTypeLabel(candidate.candidateType)} ·{' '}\n                    {candidateCompletenessLabel(candidate.completeness)}`,
    ],
    ['用于 T1 正文', '用于生成正文'],
    [
      '骨架不会进入正文差异、采用、Version 或定稿；请先用它生成 T1 正文候选。',
      '情节骨架不会直接进入正文差异、采用、历史版本或定稿；请先用它生成正文建议稿。',
    ],
    ['丢弃候选', '丢弃建议稿'],
    ['选择候选稿', '选择建议稿'],
    ['候选稿', '建议稿'],
    ['候选列表读取失败', '建议稿列表读取失败'],
    ['候选读取失败', '建议稿读取失败'],
    ['候选无 Beat 关联时使用此模式。', '建议稿没有场景节拍关联时使用此模式。'],
    ['选择至少两个正文候选', '选择至少两个正文建议稿'],
    ['ApplyRecord', '采用记录'],
  ]) {
    source = source.replaceAll(before, after);
  }

  source = source.replaceAll('<dt>Run</dt>', '<dt>生成记录</dt>');
  source = source.replaceAll('<dt>Prompt</dt>', '<dt>提示词版本</dt>');
  source = source.replaceAll('<dt>支持档位</dt>', '<dt>兼容状态</dt>');
  source = source.replaceAll('<dt>输出</dt>', '<dt>输出方式</dt>');
  return source;
});

await patchFile('apps/desktop/renderer/src/features/data-tools/data-tools-workbench.tsx', (input) => {
  let source = input;
  source = replaceRequired(
    source,
    `import { useCallback, useEffect, useState } from 'react';`,
    `import { useCallback, useEffect, useMemo, useState } from 'react';`,
    '整书导出React导入',
  );
  source = replaceRequired(
    source,
    `import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';`,
    `import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import {
  finalizedVersionIds,
  wholeBookExportLabel,
} from './text-export-selection.js';`,
    '整书导出模型导入',
  );

  for (const [before, after] of [
    ['Data Safety', '本地作品安全'],
    ['恢复点、只读导出和文本导入导出继续由Core执行校验与原子事务。', '恢复点、只读导出和文本导入导出继续由本地服务执行校验与原子写入。'],
    ['数据库：', '作品数据库：'],
    ['Schema ', '数据结构版本 '],
    ['可安全导出的Version', '可安全导出的历史版本'],
    ['暂无可导出Version。', '暂无可导出的历史版本。'],
    ['Version导出', '历史版本与整书导出'],
    ['仅导出明确勾选的Version，不读取未定稿Draft。', '只导出明确选择的历史版本；整书导出会一次选择全部定稿版本，不读取未定稿当前稿。'],
  ]) {
    source = source.replaceAll(before, after);
  }

  source = source.replace(
    `{command.error ? \`${'${command.error.message}'} · ${'${command.error.code}'}\` : status}`,
    `{command.error ? authorErrorSummary(command.error) : status}`,
  );
  source = source.replace(
    `    if (command.error) setStatus(\`${'${operationLabel}'}失败 · ${'${command.error.code}'}\`);`,
    `    if (command.error) setStatus(\`${'${operationLabel}'}失败：${'${authorErrorSummary(command.error)}'}\`);`,
  );

  source = replaceRequired(
    source,
    `  const [operationLabel, setOperationLabel] = useState('操作');
  const command = useBridgeCommand();`,
    `  const [operationLabel, setOperationLabel] = useState('操作');
  const command = useBridgeCommand();
  const finalizedIds = useMemo(
    () => finalizedVersionIds(exports.data?.versions ?? []),
    [exports.data?.versions],
  );`,
    '全部定稿计算',
  );

  source = replaceRequired(
    source,
    `        <div className="export-version-list">`,
    `        <div className="inline-actions export-selection-actions">
          <button
            data-select-finalized-versions
            disabled={finalizedIds.length === 0}
            type="button"
            onClick={() => setSelectedVersions(new Set(finalizedIds))}
          >
            选择全部定稿（{finalizedIds.length}章）
          </button>
          <button
            disabled={selectedVersions.size === 0}
            type="button"
            onClick={() => setSelectedVersions(new Set())}
          >
            清空选择
          </button>
          <span>已选择 {selectedVersions.size} 个版本</span>
        </div>
        <div className="export-version-list">`,
    '全部定稿选择按钮',
  );

  source = replaceRequired(
    source,
    `          选择目录并导出
        </button>`,
    `          {wholeBookExportLabel(selectedVersions, exports.data?.versions ?? [])}
        </button>`,
    '整书导出按钮名称',
  );
  return source;
});

await patchFile('apps/desktop/renderer/src/m3.css', (input) => {
  if (input.includes('.review-diff__toolbar')) throw new Error('差异审阅样式已经存在。');
  return `${input}\n
.provider-preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
}

.provider-preset-card {
  display: grid;
  gap: 6px;
  min-height: 88px;
  padding: 12px;
  text-align: left;
}

.provider-preset-card[aria-pressed='true'] {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}

.provider-preset-card span,
.review-diff__toolbar span {
  font-size: 12px;
  opacity: 0.72;
}

.provider-advanced-settings {
  grid-column: 1 / -1;
}

.review-diff {
  display: grid;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border-color, rgba(127, 127, 127, 0.28));
  border-radius: 10px;
}

.review-diff__toolbar,
.review-diff__headings {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color, rgba(127, 127, 127, 0.28));
}

.review-diff__toolbar > div:first-child {
  display: grid;
  gap: 2px;
}

.review-diff__headings {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.review-diff__body {
  max-height: 560px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 13px;
  line-height: 1.65;
}

.review-diff__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  border-bottom: 1px solid rgba(127, 127, 127, 0.16);
}

.review-diff__row[data-active='true'] {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}

.review-diff__line {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  min-width: 0;
}

.review-diff__line + .review-diff__line {
  border-left: 1px solid rgba(127, 127, 127, 0.22);
}

.review-diff__number {
  padding: 4px 8px;
  text-align: right;
  user-select: none;
  opacity: 0.48;
  background: rgba(127, 127, 127, 0.08);
}

.review-diff__text {
  min-height: 30px;
  padding: 4px 8px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.review-diff__text mark,
.review-diff__text del {
  padding: 0 1px;
  text-decoration-thickness: 1px;
}

.review-diff__row[data-diff-kind='added'] [data-side='comparison'],
.review-diff__text mark {
  background: rgba(65, 150, 90, 0.18);
}

.review-diff__row[data-diff-kind='removed'] [data-side='current'],
.review-diff__text del {
  background: rgba(190, 75, 75, 0.16);
}

.review-diff__row[data-diff-kind='changed'] {
  background: rgba(180, 135, 45, 0.08);
}

@media (max-width: 900px) {
  .review-diff__row,
  .review-diff__headings {
    grid-template-columns: 1fr;
  }

  .review-diff__line + .review-diff__line {
    border-left: 0;
    border-top: 1px dashed rgba(127, 127, 127, 0.22);
  }
}
`;
});

await patchFile('docs/product/AUTHOR_LANGUAGE_GOVERNED_PATHS.json', (input) => {
  const governed = JSON.parse(input);
  for (const filePath of [
    'apps/desktop/renderer/src/features/settings/provider-settings.tsx',
    'apps/desktop/renderer/src/features/settings/provider-presets.ts',
    'apps/desktop/renderer/src/features/data-tools/',
    'apps/desktop/renderer/src/features/writing/review-diff.ts',
    'apps/desktop/renderer/src/features/writing/review-diff-panel.tsx',
    'tests/unit/author-review-delivery.test.ts',
  ]) {
    if (!governed.paths.includes(filePath)) governed.paths.push(filePath);
  }
  return `${JSON.stringify(governed, null, 2)}\n`;
});

console.log('建议稿与历史版本差异、AI连接预设和整书定稿导出已接入。');
