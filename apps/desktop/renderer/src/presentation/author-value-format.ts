const ENTITY_TYPE_LABELS: Readonly<Record<string, string>> = {
  character: '人物',
  location: '地点',
  faction: '阵营',
  item: '物品',
  ability: '能力',
  rule: '世界规则',
  event: '重要事件',
  custom: '其他设定',
};

const FORESHADOWING_STATUS_LABELS: Readonly<Record<string, string>> = {
  planned: '待埋设',
  planted: '已埋设',
  reinforced: '已强化',
  partially_revealed: '已部分揭示',
  revealed: '已回收',
  cancelled: '已取消',
};

const CHARACTER_ARC_STATUS_LABELS: Readonly<Record<string, string>> = {
  planned: '待开始',
  active: '进行中',
  completed: '已完成',
  abandoned: '已放弃',
};

const ATTENTION_LABELS: Readonly<Record<string, string>> = {
  none: '状态正常',
  due: '需要关注',
  overdue: '已经逾期',
  blocked: '存在阻断',
};

export function authorEntityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? '其他设定';
}

export function authorForeshadowingStatusLabel(status: string): string {
  return FORESHADOWING_STATUS_LABELS[status] ?? '状态未知';
}

export function authorCharacterArcStatusLabel(status: string): string {
  return CHARACTER_ARC_STATUS_LABELS[status] ?? '状态未知';
}

export function authorAttentionLabel(attention: string): string {
  return ATTENTION_LABELS[attention] ?? '状态未知';
}

export function authorJsonValue(value: unknown): string {
  if (value === null) return '无';
  if (typeof value === 'string') return value || '空内容';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.length === 0 ? '无' : value.map((item) => authorJsonValue(item)).join('、');
  }
  if (typeof value === 'object') return '结构化内容';
  return '无法显示';
}
