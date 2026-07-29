import { describe, expect, it } from 'vitest';

import type { CandidateSummary } from '@worldforge/contracts';

import {
  candidateReviewGroupId,
  changedReviewLineIndexes,
  createReviewDiff,
  groupCandidatesForReview,
  sceneBeatReviewLabel,
} from '../../apps/desktop/renderer/src/features/writing/review-diff.js';
import {
  applyProviderPreset,
  providerProtocolLabel,
} from '../../apps/desktop/renderer/src/features/settings/provider-presets.js';
import {
  finalizedVersionIds,
  selectedAllFinalized,
  wholeBookExportLabel,
} from '../../apps/desktop/renderer/src/features/data-tools/text-export-selection.js';

const HASH = 'a'.repeat(64);
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHAPTER_ID = '550e8400-e29b-41d4-a716-446655440001';
const DRAFT_ID = '550e8400-e29b-41d4-a716-446655440002';

function candidate(
  id: string,
  status: CandidateSummary['status'],
  type: CandidateSummary['candidateType'],
  completeness: CandidateSummary['completeness'] = 'complete',
): CandidateSummary {
  const base = {
    candidateId: id,
    projectId: PROJECT_ID,
    chapterId: CHAPTER_ID,
    generationRunId: null,
    baseDraftId: DRAFT_ID,
    baseDraftRevision: 1,
    completeness,
    status,
    title: id,
    sourceVersionId: null,
    contentHash: HASH,
    createdAt: '2026-07-29T00:00:00.000Z',
    resolvedAt: status === 'pending' ? null : '2026-07-29T00:01:00.000Z',
  } as const;
  if (type === 'skeleton') {
    return {
      ...base,
      candidateType: 'skeleton',
      blockCount: 0,
      skeletonRevisionId: '550e8400-e29b-41d4-a716-446655440003',
      skeletonRevision: 1,
      payloadSchemaVersion: 1,
      payloadHash: HASH,
      sourceState: 'current',
      parentSkeletonRevisionId: null,
      editedBy: 'ai',
    };
  }
  return { ...base, candidateType: type, blockCount: 1 };
}

describe('作者差异审阅', () => {
  it('生成并排行差异和行内差异', () => {
    const diff = createReviewDiff('第一段\n旧句\n尾声', '第一段\n新句\n尾声\n新增段');
    expect(diff.map((line) => line.kind)).toEqual(['unchanged', 'changed', 'unchanged', 'added']);
    expect(changedReviewLineIndexes(diff)).toEqual([1, 3]);
    expect(diff[1]?.currentSegments.some((segment) => segment.kind === 'removed')).toBe(true);
    expect(diff[1]?.comparisonSegments.some((segment) => segment.kind === 'added')).toBe(true);
  });

  it('按作者审阅状态分组建议稿', () => {
    const values = [
      candidate('待审阅', 'pending', 'full'),
      candidate('未完成', 'pending', 'rewrite', 'partial'),
      candidate('骨架', 'pending', 'skeleton'),
      candidate('已采用', 'accepted', 'merge'),
      candidate('已丢弃', 'discarded', 'full'),
    ];
    expect(values.map(candidateReviewGroupId)).toEqual([
      'pending',
      'partial',
      'skeleton',
      'accepted',
      'discarded',
    ]);
    expect(groupCandidatesForReview(values).map((group) => group.label)).toEqual([
      '待审阅',
      '未完成内容',
      '情节骨架',
      '已采用',
      '已丢弃',
    ]);
  });

  it('场景节拍显示标题和目标', () => {
    expect(
      sceneBeatReviewLabel(
        [
          {
            id: '550e8400-e29b-41d4-a716-446655440004',
            projectId: PROJECT_ID,
            chapterId: CHAPTER_ID,
            plotNodeId: null,
            title: '雨夜追踪',
            goal: '让主角发现伪证',
            coreConflict: '',
            expectedResult: '',
            beatType: 'development',
            wordTargetPercent: 50,
            required: true,
            orderKey: '1024',
            characterIds: [],
            locationIds: [],
            updatedAt: '2026-07-29T00:00:00.000Z',
          },
        ],
        '550e8400-e29b-41d4-a716-446655440004',
      ),
    ).toBe('雨夜追踪 · 让主角发现伪证');
  });
});

describe('AI连接预设', () => {
  it('本机预设不要求作者填写协议和地址', () => {
    const ollama = applyProviderPreset('ollama');
    const lmStudio = applyProviderPreset('lm-studio');
    expect(ollama.baseUrl).toBe('http://127.0.0.1:11434/v1');
    expect(lmStudio.baseUrl).toBe('http://127.0.0.1:1234/v1');
    expect(providerProtocolLabel(ollama.protocol)).toBe('OpenAI兼容接口');
  });

  it('Anthropic预设使用原生接口', () => {
    const anthropic = applyProviderPreset('anthropic');
    expect(anthropic.protocol).toBe('anthropic');
    expect(anthropic.options).toEqual({ anthropicVersion: '2023-06-01' });
  });
});

describe('整书定稿导出', () => {
  const versions = [
    { versionId: 'final-1', finalized: true },
    { versionId: 'draft-1', finalized: false },
    { versionId: 'final-2', finalized: true },
  ];

  it('一次选择全部定稿版本', () => {
    expect(finalizedVersionIds(versions)).toEqual(['final-1', 'final-2']);
    expect(selectedAllFinalized(new Set(['final-1', 'final-2']), versions)).toBe(true);
    expect(wholeBookExportLabel(new Set(['final-1', 'final-2']), versions)).toBe(
      '选择目录并导出整部作品',
    );
  });

  it('部分选择仍按所选版本导出', () => {
    expect(selectedAllFinalized(new Set(['final-1']), versions)).toBe(false);
    expect(wholeBookExportLabel(new Set(['final-1']), versions)).toBe('选择目录并导出所选版本');
  });
});
