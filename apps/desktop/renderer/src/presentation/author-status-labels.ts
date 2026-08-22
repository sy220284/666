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
  healthy: '运行正常',
  starting: '正在启动',
  degraded: '部分功能受限',
  stopped: '已经停止',
  crashed: '意外停止',
  unreachable: '暂时无法连接',
} as const;

export type AuthorStatusKey = keyof typeof AUTHOR_STATUS_LABELS;

export function authorStatusLabel(status: string): string {
  return AUTHOR_STATUS_LABELS[status as AuthorStatusKey] ?? '状态未知';
}

export function authorGenerationStageLabel(stage: string, status?: string): string {
  if (status === 'failed' || stage === 'failed') return '失败';
  if (status === 'cancelled' || stage === 'cancelled') return '已取消';
  if (status === 'succeeded' || stage === 'completed') return '已完成';
  if (status === 'queued' || stage === 'queued') return '等待开始';
  if (stage === 'assembling_constraints' || stage === 'preparing') return '准备上下文';
  if (stage === 'calling_model' || stage === 'receiving_output' || stage === 'generating')
    return '生成建议稿';
  if (
    stage === 'parsing_output' ||
    stage === 'saving_candidate' ||
    stage === 'validating_candidate'
  )
    return '整理结果';
  return '正在处理';
}
