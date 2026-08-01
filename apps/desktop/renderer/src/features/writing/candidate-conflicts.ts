import type { CandidateConflictItem } from '@worldforge/contracts';

const CANDIDATE_CONFLICT_LABELS: Readonly<Record<CandidateConflictItem['kind'], string>> = {
  project: '建议稿不属于当前作品',
  'candidate-status': '建议稿已经处理',
  'partial-restricted': '未完成建议稿不能替换整章',
  revision: '建议稿生成后当前稿已经变化',
  hash: '正文内容与生成时不一致',
  locked: '建议稿涉及已锁定的正文',
  'missing-block': '建议稿引用的正文位置已经不存在',
  structure: '建议稿与当前正文结构不一致',
  'duplicate-apply': '建议稿已经采用过',
  'undo-stale': '采用后当前稿已经变化，无法整体撤销',
};

export function candidateConflictLabel(kind: CandidateConflictItem['kind']): string {
  return CANDIDATE_CONFLICT_LABELS[kind];
}
