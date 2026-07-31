export interface AuthorErrorMessage {
  readonly title: string;
  readonly message: string;
  readonly suggestedAction?: string;
}

const SPECIFIC_MESSAGES: Readonly<Record<string, AuthorErrorMessage>> = {
  DRAFT_REVISION_CONFLICT_001: {
    title: '当前稿已经发生变化',
    message: '保存所依据的正文版本已经更新，系统没有覆盖较新的内容。',
    suggestedAction: '请重新打开当前章节，核对新内容后再次保存。',
  },
  DRAFT_BLOCK_HASH_CONFLICT_002: {
    title: '正文内容与预期不一致',
    message: '目标段落在操作期间发生变化，系统已经停止本次修改。',
    suggestedAction: '请重新定位目标段落并再次确认。',
  },
  DRAFT_BLOCK_LOCKED_003: {
    title: '部分正文已经锁定',
    message: '本次操作涉及受保护段落，系统没有修改锁定内容。',
    suggestedAction: '请检查锁定范围，或只处理未锁定内容。',
  },
  VERSION_IMMUTABLE_001: {
    title: '历史版本不可直接修改',
    message: '历史版本用于留档和恢复，系统不会原地改写。',
    suggestedAction: '请恢复为新的当前稿后继续编辑。',
  },
  CANDIDATE_ALREADY_RESOLVED_001: {
    title: '这份建议稿已经处理',
    message: '建议稿已经采用或丢弃，不能重复执行。',
    suggestedAction: '请刷新建议稿列表，继续处理其他内容。',
  },
  CANDIDATE_BASE_CONFLICT_002: {
    title: '建议稿所依据的当前稿已经变化',
    message: '系统检测到生成建议稿后的新修改，因此没有覆盖正文。',
    suggestedAction: '请重新比较当前稿与建议稿后再决定。',
  },
  AI_PROVIDER_NOT_CONFIGURED_001: {
    title: '尚未配置AI连接',
    message: '当前没有可用的AI服务配置，离线写作功能仍可继续使用。',
    suggestedAction: '请在设置中选择服务预设并保存。',
  },
  AI_CREDENTIAL_MISSING_002: {
    title: 'AI服务缺少密钥',
    message: '当前服务需要密钥才能连接。',
    suggestedAction: '请补充密钥并重新测试连接。',
  },
  AI_CONNECTION_FAILED_003: {
    title: '无法连接AI服务',
    message: '模型服务没有响应，离线写作功能仍可继续使用。',
    suggestedAction: '请检查服务是否启动、地址是否正确以及网络是否可用。',
  },
  AI_AUTH_FAILED_004: {
    title: 'AI服务身份验证失败',
    message: '服务拒绝了当前密钥或访问凭据。',
    suggestedAction: '请核对密钥和服务权限后重新测试。',
  },
  AI_RATE_LIMITED_005: {
    title: 'AI服务暂时繁忙',
    message: '服务限制了当前请求频率，正文与本地数据没有受到影响。',
    suggestedAction: '请稍后重试或检查服务配额。',
  },
  AI_REQUEST_TIMEOUT_006: {
    title: 'AI请求等待超时',
    message: '服务未在设定时间内完成响应。',
    suggestedAction: '请检查模型运行状态，或延长等待时间。',
  },
  AI_CONTEXT_OVERFLOW_007: {
    title: '发送给AI的内容过长',
    message: '当前模型无法一次处理这些上下文，正文没有被修改。',
    suggestedAction: '请缩小生成范围或改用支持更长上下文的模型。',
  },
  AI_OUTPUT_INVALID_008: {
    title: 'AI返回内容无法使用',
    message: '服务返回的内容不符合当前操作要求，系统没有写入正文。',
    suggestedAction: '请重试，或更换模型与生成方式。',
  },
  AI_STREAM_INTERRUPTED_009: {
    title: 'AI输出中途断开',
    message: '已经收到的内容仍可作为未完成建议稿保存。',
    suggestedAction: '可保存现有内容后继续生成，或重新发起任务。',
  },
  AI_MODEL_UNSUPPORTED_010: {
    title: '当前模型不支持所需能力',
    message: '该模型无法完成本次生成方式，正文没有被修改。',
    suggestedAction: '请更换模型或选择其他生成方式。',
  },
  AI_ENDPOINT_UNSAFE_013: {
    title: 'AI服务地址不符合安全要求',
    message: '系统已阻止连接不安全或越过本机边界的地址。',
    suggestedAction: '请使用本机地址或有效的HTTPS服务地址。',
  },
  AI_RESPONSE_TOO_LARGE_014: {
    title: 'AI返回内容超过安全上限',
    message: '模型服务返回的数据量过大，系统已经停止接收，正文和本地数据没有被修改。',
    suggestedAction: '请缩小生成范围、降低输出长度，或检查模型服务是否异常。',
  },
};

const DOMAIN_MESSAGES: readonly (readonly [string, AuthorErrorMessage])[] = [
  [
    'COMMON_',
    {
      title: '操作未能安全完成',
      message: '系统已经停止本次操作，现有内容保持不变。',
      suggestedAction: '请确认输入与当前状态后重试。',
    },
  ],
  [
    'PROJECT_',
    {
      title: '作品操作未完成',
      message: '作品目录、身份或打开状态不满足本次操作要求。',
      suggestedAction: '请检查作品位置和当前打开状态后重试。',
    },
  ],
  [
    'DB_',
    {
      title: '作品数据库需要处理',
      message: '本地数据库暂时无法安全完成本次操作，系统没有继续写入。',
      suggestedAction: '请稍后重试；持续失败时进入恢复与导出。',
    },
  ],
  [
    'DRAFT_',
    {
      title: '当前稿操作未完成',
      message: '当前稿状态已经变化或不满足安全写入条件。',
      suggestedAction: '请重新打开章节并核对正文状态。',
    },
  ],
  [
    'VERSION_',
    {
      title: '历史版本操作未完成',
      message: '目标历史版本不存在、不可修改或未能安全创建。',
      suggestedAction: '请刷新版本列表后重试。',
    },
  ],
  [
    'CANDIDATE_',
    {
      title: '建议稿操作未完成',
      message: '建议稿状态或所依据的当前稿已经变化。',
      suggestedAction: '请刷新建议稿并重新比较。',
    },
  ],
  [
    'AI_',
    {
      title: 'AI操作未完成',
      message: 'AI连接或生成运行未能完成，正文和本地数据保持不变。',
      suggestedAction: '请检查AI连接、模型状态和生成范围。',
    },
  ],
  [
    'IMPORT_',
    {
      title: '旧稿导入未完成',
      message: '文件格式、编码、内容或导入预览不满足安全导入要求。',
      suggestedAction: '请重新选择文件并检查导入预览。',
    },
  ],
  [
    'EXPORT_',
    {
      title: '作品导出未完成',
      message: '导出版本或目标位置不满足写入要求。',
      suggestedAction: '请重新选择版本和空闲导出位置。',
    },
  ],
  [
    'BACKUP_',
    {
      title: '作品备份未完成',
      message: '本次备份未能通过空间或完整性检查，现有作品不受影响。',
      suggestedAction: '请检查磁盘空间和备份位置后重试。',
    },
  ],
  [
    'RESTORE_',
    {
      title: '作品恢复未完成',
      message: '恢复来源或目标未能通过安全校验，当前作品没有被覆盖。',
      suggestedAction: '请重新选择有效恢复点和新的目标位置。',
    },
  ],
  [
    'SEARCH_',
    {
      title: '全文搜索操作未完成',
      message: '搜索索引或替换计划已经变化，系统没有执行可能过期的操作。',
      suggestedAction: '请刷新索引或重新预览替换范围。',
    },
  ],
  [
    'VALIDATION_',
    {
      title: '作品检查未完成',
      message: '检查所依据的内容已经变化，旧结果不会写入当前状态。',
      suggestedAction: '请重新选择当前内容并再次运行检查。',
    },
  ],
  [
    'TASK_',
    {
      title: '后台任务未完成',
      message: '任务状态已经变化、无法取消或执行失败。',
      suggestedAction: '请刷新任务状态后重试。',
    },
  ],
  [
    'BRIDGE_',
    {
      title: '界面与本地服务通信失败',
      message: '本次请求未能安全到达本地服务，现有内容保持不变。',
      suggestedAction: '请重试；持续失败时重启本地服务。',
    },
  ],
];

export function authorErrorMessage(code: string, fallbackMessage?: string): AuthorErrorMessage {
  const specific = SPECIFIC_MESSAGES[code];
  if (specific) return specific;
  const domain = DOMAIN_MESSAGES.find(([prefix]) => code.startsWith(prefix));
  if (domain) return domain[1];
  const fallback = fallbackMessage?.trim();
  return {
    title: '操作未完成',
    message:
      fallback && /[\u3400-\u9fff]/u.test(fallback)
        ? fallback
        : '系统未能完成本次操作，现有内容保持不变。',
    suggestedAction: '请查看技术详情后重试。',
  };
}

export function authorErrorSummary(error: {
  readonly code: string;
  readonly message: string;
}): string {
  const content = authorErrorMessage(error.code);
  return [content.title, content.message, content.suggestedAction].filter(Boolean).join(' ');
}
