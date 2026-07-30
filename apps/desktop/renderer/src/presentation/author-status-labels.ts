export const AUTHOR_STATUS_LABELS = {
  pending: '等待处理',
  accepted: '已采用',
  edited: '编辑后采用',
  rejected: '已拒绝',
  discarded: '已丢弃',
  current: '当前有效',
  archived: '已归档',
  stale: '来源已经变化',
  valid: '当前有效',
  open: '待处理',
  resolved: '已处理',
  mixed: '部分已裁决',
  ignored: '已忽略',
  false_positive: '已标记为误报',
  complete: '完整',
  partial: '未完成',
  queued: '等待开始',
  running: '进行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  exact: '准确时间',
  approximate: '大致时间',
  unknown: '尚不确定',
  low: '一般',
  medium: '重要',
  high: '严重',
  critical: '必须处理',
} as const;

export type AuthorStatusKey = keyof typeof AUTHOR_STATUS_LABELS;

export function authorStatusLabel(status: string): string {
  return AUTHOR_STATUS_LABELS[status as AuthorStatusKey] ?? '状态未知';
}
