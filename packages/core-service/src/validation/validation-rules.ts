import type { DatabaseSync } from 'node:sqlite';

import type { VersionBlockRow, VersionRow } from './validation-model.js';
import { authorityConflictRules } from './authority-conflict-rules.js';
import type { RuleIssue } from './validation-rule-model.js';

export const RULE_VERSION = 'worldforge.rules.v2';
export const CONFIG_VERSION = 'general-writing.v1';
export const RULE_CONFIG = {
  longParagraphCharacters: 1_000,
  longSentenceCharacters: 80,
  minimumDialogueSampleCharacters: 500,
  lowDialogueRatio: 0.05,
  highDialogueRatio: 0.8,
} as const;

export function rules(
  database: DatabaseSync,
  version: VersionRow,
  blocks: readonly VersionBlockRow[],
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const bodyBlocks = blocks.filter((block) => block.blockType !== 'separator');
  for (const block of bodyBlocks) {
    if (!block.text.trim()) {
      issues.push({
        issueType: 'format.empty_block',
        severity: 'medium',
        rationale: '正文中存在空内容块，可能影响导出和阅读连续性。',
        suggestion: '建议删除空块或补充正文。',
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash,
        textQuote: null,
        rangeHint: null,
        evidenceIds: [block.logicalBlockId],
        ruleId: 'format.empty_block',
      });
    }
    const repeated = /([!?！？。，,.])\1{2,}/u.exec(block.text);
    if (repeated?.index !== undefined) {
      issues.push({
        issueType: 'format.repeated_punctuation',
        severity: 'low',
        rationale: '检测到连续重复标点，可能是输入错误。',
        suggestion: '建议核对标点是否符合作者意图。',
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash,
        textQuote: repeated[0],
        rangeHint: { start: repeated.index, end: repeated.index + repeated[0].length },
        evidenceIds: [block.logicalBlockId],
        ruleId: 'format.repeated_punctuation',
      });
    }
    if (block.text.length > RULE_CONFIG.longParagraphCharacters) {
      issues.push({
        issueType: 'stats.long_paragraph',
        severity: 'info',
        rationale: `段落为 ${block.text.length} 字符，超过通用参考值 ${RULE_CONFIG.longParagraphCharacters}。`,
        suggestion: '可按叙事节奏决定是否拆分；这不是强制文风规则。',
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash,
        textQuote: block.text.slice(0, 120),
        rangeHint: null,
        evidenceIds: [block.logicalBlockId],
        ruleId: 'stats.long_paragraph',
      });
    }
  }
  const fullText = bodyBlocks.map((block) => block.text).join('\n');
  const sentences = fullText
    .split(/[。！？!?]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const averageSentence =
    sentences.length === 0
      ? 0
      : sentences.reduce((total, sentence) => total + sentence.length, 0) / sentences.length;
  if (averageSentence > RULE_CONFIG.longSentenceCharacters) {
    issues.push({
      issueType: 'stats.long_sentences',
      severity: 'info',
      rationale: `平均句长约 ${averageSentence.toFixed(1)} 字符，高于通用参考值 ${RULE_CONFIG.longSentenceCharacters}。`,
      suggestion: '建议结合目标文风核对阅读节奏。',
      logicalBlockId: null,
      expectedBlockHash: null,
      textQuote: null,
      rangeHint: null,
      evidenceIds: [version.versionId],
      ruleId: 'stats.long_sentences',
    });
  }
  if (fullText.length >= RULE_CONFIG.minimumDialogueSampleCharacters) {
    const dialogueCharacters = bodyBlocks
      .filter((block) => block.blockType === 'dialogue')
      .reduce((total, block) => total + block.text.length, 0);
    const ratio = fullText.length === 0 ? 0 : dialogueCharacters / fullText.length;
    if (ratio < RULE_CONFIG.lowDialogueRatio || ratio > RULE_CONFIG.highDialogueRatio) {
      issues.push({
        issueType: 'stats.dialogue_ratio',
        severity: 'info',
        rationale: `对话字符占比约 ${(ratio * 100).toFixed(1)}%，超出通用参考区间。`,
        suggestion: '建议按章节功能和目标文风人工判断，无需机械调整。',
        logicalBlockId: null,
        expectedBlockHash: null,
        textQuote: null,
        rangeHint: null,
        evidenceIds: [version.versionId],
        ruleId: 'stats.dialogue_ratio',
      });
    }
  }
  const missingRequired = database
    .prepare(
      `SELECT beat.id, beat.title
         FROM scene_beats beat
        WHERE beat.project_id = ? AND beat.chapter_id = ?
          AND beat.is_required = 1 AND beat.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
              FROM scene_beat_block_links link
              JOIN draft_blocks draft_block ON draft_block.id = link.draft_block_id
              JOIN version_blocks version_block
                ON version_block.logical_block_id = draft_block.logical_block_id
               AND version_block.version_id = ?
             WHERE link.scene_beat_id = beat.id
          )
        ORDER BY beat.order_key, beat.id`,
    )
    .all(version.projectId, version.chapterId, version.versionId) as unknown as Array<{
    readonly id: string;
    readonly title: string;
  }>;
  for (const beat of missingRequired) {
    issues.push({
      issueType: 'structure.required_scene_beat',
      severity: 'high',
      rationale: `必选 SceneBeat“${beat.title}”没有对应的定稿正文块。`,
      suggestion: '建议核对章节结构或正文块与 SceneBeat 的关联。',
      logicalBlockId: null,
      expectedBlockHash: null,
      textQuote: null,
      rangeHint: null,
      evidenceIds: [beat.id, version.versionId],
      ruleId: 'structure.required_scene_beat',
    });
  }
  return [...issues, ...authorityConflictRules(database, version)];
}
