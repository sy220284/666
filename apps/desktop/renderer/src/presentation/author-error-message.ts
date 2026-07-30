export interface AuthorErrorMessage {
  readonly title: string;
  readonly message: string;
  readonly suggestedAction?: string;
}

const AUTHOR_ERROR_MESSAGES: Readonly<Record<string, AuthorErrorMessage>> = {
  REVISION_CONFLICT: {
    title: '当前稿已经发生变化',
    message: '建议稿生成后，当前稿又有新的修改。系统没有覆盖正文。',
    suggestedAction: '请重新比较内容后再采用。',
  },
  HASH_CONFLICT: {
    title: '正文内容与预期不一致',
    message: '系统检测到正文内容已经变化，因此停止本次修改。',
    suggestedAction: '请重新打开目标内容并再次确认。',
  },
  LOCK_CONFLICT: {
    title: '部分内容已经锁定',
    message: '本次操作涉及受保护的正文块，系统没有修改这些内容。',
    suggestedAction: '请检查锁定范围，或只处理未锁定内容。',
  },
  READ_ONLY: {
    title: '作品处于只读保护状态',
    message: '当前作品只能查看，不能写入或修改。',
    suggestedAction: '请处理作品目录或数据完整性问题后重新打开。',
  },
  CORE_UNAVAILABLE: {
    title: '本地服务暂时不可用',
    message: '应用界面暂时无法连接本地写作服务。',
    suggestedAction: '请重新启动本地服务，未保存内容不要关闭。',
  },
  PROVIDER_UNAVAILABLE: {
    title: 'AI连接不可用',
    message: '当前AI连接未通过连接测试，基础写作功能仍可继续使用。',
    suggestedAction: '请检查模型服务、地址、模型名称和密钥。',
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
    suggestedAction: '请检查模型运行状态，或在高级设置中延长等待时间。',
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
  AI_RESPONSE_TOO_LARGE_014: {
    title: 'AI返回内容超过安全上限',
    message: '模型服务返回的数据量过大，系统已经停止接收，正文和本地数据没有被修改。',
    suggestedAction: '请缩小生成范围、降低输出长度，或检查模型服务是否异常。',
  },
};

export function authorErrorMessage(code: string, fallbackMessage?: string): AuthorErrorMessage {
  return (
    AUTHOR_ERROR_MESSAGES[code] ?? {
      title: '操作未完成',
      message: fallbackMessage?.trim() || '系统未能完成本次操作，现有内容保持不变。',
      suggestedAction: '请查看技术详情后重试。',
    }
  );
}

export function authorErrorSummary(error: {
  readonly code: string;
  readonly message: string;
}): string {
  const content = authorErrorMessage(error.code, error.message);
  return [content.title, content.message, content.suggestedAction].filter(Boolean).join(' ');
}
