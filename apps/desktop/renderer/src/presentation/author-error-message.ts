export interface AuthorErrorMessage {
  readonly title: string;
  readonly message: string;
  readonly suggestedAction?: string;
}

const AUTHOR_ERROR_MESSAGES: Readonly<Record<string, AuthorErrorMessage>> = {
  COMMON_INVALID_INPUT_001: {
    title: '输入内容无法使用',
    message: '本次提交的内容或参数不符合当前操作要求，现有作品数据没有变化。',
    suggestedAction: '请检查必填项和输入格式后重试。',
  },
  COMMON_NOT_FOUND_002: {
    title: '目标内容已经不存在',
    message: '系统没有找到本次操作对应的作品内容。',
    suggestedAction: '请重新打开当前页面并选择仍然存在的目标。',
  },
  COMMON_CONFLICT_003: {
    title: '内容状态已经变化',
    message: '系统检测到本次操作所依据的状态已经过期，因此没有继续写入。',
    suggestedAction: '请重新读取最新内容后再次操作。',
  },
  COMMON_CANCELLED_004: {
    title: '操作已取消',
    message: '系统没有继续执行本次操作，现有内容保持不变。',
  },
  COMMON_TIMEOUT_005: {
    title: '操作等待超时',
    message: '本地服务没有在安全时间内完成响应。',
    suggestedAction: '请确认本地服务状态后重试。',
  },
  COMMON_INTERNAL_999: {
    title: '本地服务遇到异常',
    message: '系统已经停止本次操作，现有作品内容保持不变。',
    suggestedAction: '请重试；若问题持续，请导出诊断包。',
  },
  BRIDGE_UNEXPECTED_FAILURE: {
    title: '界面与本地服务通信失败',
    message: '本次请求没有完成，现有作品内容保持不变。',
    suggestedAction: '请重试，或在设置中重启本地服务。',
  },
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
    message: '本次操作涉及受保护的正文段落，系统没有修改这些内容。',
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
    title: '智能连接不可用',
    message: '当前智能连接未通过连接测试，基础写作功能仍可继续使用。',
    suggestedAction: '请检查模型服务、地址、模型名称和密钥。',
  },
  DRAFT_REVISION_CONFLICT_001: {
    title: '当前稿已经有更新',
    message: '保存所依据的正文版本已经变化，系统没有覆盖较新的内容。',
    suggestedAction: '请重新打开章节，确认最新正文后继续编辑。',
  },
  DRAFT_BLOCK_HASH_CONFLICT_002: {
    title: '正文校验未通过',
    message: '目标段落的内容已经变化，系统停止了本次写入。',
    suggestedAction: '请重新读取章节后再次操作。',
  },
  DRAFT_BLOCK_LOCKED_003: {
    title: '目标段落已经锁定',
    message: '受保护段落没有被修改。',
    suggestedAction: '请先确认锁定范围，或改为处理未锁定段落。',
  },
  DRAFT_PATCH_INVALID_004: {
    title: '正文修改无法应用',
    message: '本次修改与当前正文结构不兼容，系统没有写入。',
    suggestedAction: '请重新打开章节并重试。',
  },
  DRAFT_NO_ACTIVE_005: {
    title: '当前没有可编辑稿件',
    message: '系统没有找到当前章节的活动稿件。',
    suggestedAction: '请重新打开章节或作品。',
  },
  VERSION_IMMUTABLE_001: {
    title: '历史版本不可直接修改',
    message: '已保存版本保持不可变，系统没有改写历史记录。',
    suggestedAction: '请恢复为新的当前稿后再修改。',
  },
  VERSION_CREATE_FAILED_002: {
    title: '版本留档失败',
    message: '系统未能创建本次版本快照，当前稿保持不变。',
    suggestedAction: '请确认当前稿已经保存后重试。',
  },
  CANDIDATE_ALREADY_RESOLVED_001: {
    title: '建议稿已经处理',
    message: '该建议稿已经采用或丢弃，不能重复处理。',
    suggestedAction: '请刷新建议稿列表。',
  },
  CANDIDATE_BASE_CONFLICT_002: {
    title: '建议稿依据的正文已经变化',
    message: '系统没有用旧建议稿覆盖新的当前稿。',
    suggestedAction: '请重新生成或重新比较建议稿。',
  },
  CANDIDATE_PARTIAL_RESTRICTED_003: {
    title: '当前建议稿不能部分采用',
    message: '该建议稿的结构不支持当前选择范围。',
    suggestedAction: '请改为整体采用，或重新生成可分段建议稿。',
  },
  AI_PROVIDER_NOT_CONFIGURED_001: {
    title: '尚未配置智能连接',
    message: '当前没有可用的智能服务配置，离线写作功能仍可继续使用。',
    suggestedAction: '请在设置中选择服务预设并保存。',
  },
  AI_CREDENTIAL_MISSING_002: {
    title: '智能服务缺少密钥',
    message: '当前服务需要密钥才能连接。',
    suggestedAction: '请补充密钥并重新测试连接。',
  },
  AI_CONNECTION_FAILED_003: {
    title: '无法连接智能服务',
    message: '模型服务没有响应，离线写作功能仍可继续使用。',
    suggestedAction: '请检查服务是否启动、地址是否正确以及网络是否可用。',
  },
  AI_AUTH_FAILED_004: {
    title: '智能服务身份验证失败',
    message: '服务拒绝了当前密钥或访问凭据。',
    suggestedAction: '请核对密钥和服务权限后重新测试。',
  },
  AI_RATE_LIMITED_005: {
    title: '智能服务暂时繁忙',
    message: '服务限制了当前请求频率，正文与本地数据没有受到影响。',
    suggestedAction: '请稍后重试或检查服务配额。',
  },
  AI_REQUEST_TIMEOUT_006: {
    title: '智能请求等待超时',
    message: '服务未在设定时间内完成响应。',
    suggestedAction: '请检查模型运行状态，或在高级设置中延长等待时间。',
  },
  AI_CONTEXT_OVERFLOW_007: {
    title: '发送给智能模型的内容过长',
    message: '当前模型无法一次处理这些上下文，正文没有被修改。',
    suggestedAction: '请缩小生成范围或改用支持更长上下文的模型。',
  },
  AI_OUTPUT_INVALID_008: {
    title: '智能模型返回内容无法使用',
    message: '服务返回的内容不符合当前操作要求，系统没有写入正文。',
    suggestedAction: '请重试，或更换模型与生成方式。',
  },
  AI_STREAM_INTERRUPTED_009: {
    title: '智能输出中途断开',
    message: '已经收到的内容仍可作为未完成建议稿保存。',
    suggestedAction: '可保存现有内容后继续生成，或重新发起任务。',
  },
  AI_MODEL_UNSUPPORTED_010: {
    title: '当前模型不支持所需能力',
    message: '该模型无法完成本次生成方式，正文没有被修改。',
    suggestedAction: '请更换模型或选择其他生成方式。',
  },
  AI_RUN_NOT_FOUND_011: {
    title: '生成任务已经不存在',
    message: '系统没有找到对应的智能生成任务。',
    suggestedAction: '请刷新页面后重新发起生成。',
  },
  AI_RUN_ALREADY_FINISHED_012: {
    title: '生成任务已经结束',
    message: '该任务已经完成、失败或取消，不能重复操作。',
    suggestedAction: '请查看已有建议稿或重新生成。',
  },
  AI_ENDPOINT_UNSAFE_013: {
    title: '智能服务地址不安全',
    message: '系统拒绝连接可能暴露本地环境或使用不安全协议的地址。',
    suggestedAction: '本机服务请使用localhost；远程服务请使用HTTPS。',
  },
  AI_RESPONSE_TOO_LARGE_014: {
    title: '智能模型返回内容超过安全上限',
    message: '模型服务返回的数据量过大，系统已经停止接收，正文和本地数据没有被修改。',
    suggestedAction: '请缩小生成范围、降低输出长度，或检查模型服务是否异常。',
  },
};

function domainErrorMessage(code: string): AuthorErrorMessage | null {
  if (code.startsWith('PROJECT_'))
    return {
      title: '作品操作未完成',
      message: '作品目录或当前打开状态不满足本次操作要求，现有作品文件保持不变。',
      suggestedAction: '请检查作品路径、打开状态和只读保护后重试。',
    };
  if (code.startsWith('DB_'))
    return {
      title: '作品数据库处于保护状态',
      message: '数据库操作没有安全完成，系统已停止继续写入。',
      suggestedAction: '请使用恢复与导出检查作品状态，或重启本地服务。',
    };
  if (code.startsWith('IMPORT_'))
    return {
      title: '旧稿导入未完成',
      message: '导入文件没有通过格式、编码或安全校验，现有作品内容没有变化。',
      suggestedAction: '请检查文件格式与内容后重新预览导入。',
    };
  if (code.startsWith('EXPORT_'))
    return {
      title: '作品导出未完成',
      message: '系统没有安全写出目标文件，作品数据库没有受到影响。',
      suggestedAction: '请检查导出位置、文件名和磁盘权限后重试。',
    };
  if (code.startsWith('BACKUP_'))
    return {
      title: '备份操作未完成',
      message: '本次备份或清理没有通过完整性与保护规则。',
      suggestedAction: '请检查空间和保护状态后重试，保留最近一次已验证备份。',
    };
  if (code.startsWith('RESTORE_'))
    return {
      title: '恢复操作未完成',
      message: '恢复来源或目标没有通过安全校验，当前作品没有被覆盖。',
      suggestedAction: '请重新选择有效恢复点和空闲目标位置。',
    };
  if (code.startsWith('SEARCH_'))
    return {
      title: '搜索工具需要更新',
      message: '全文索引或替换计划已经过期，权威作品数据没有受到影响。',
      suggestedAction: '请重新读取搜索状态、重建索引或重新预览替换。',
    };
  if (code.startsWith('VALIDATION_'))
    return {
      title: '检查依据已经变化',
      message: '本次检查所依据的版本或内容不再是当前状态。',
      suggestedAction: '请重新选择当前定稿并再次检查。',
    };
  if (code.startsWith('LONGFORM_'))
    return {
      title: '长篇创作设置未完成',
      message: '长篇记忆、文风档案或智能任务分配没有安全完成，正文与权威故事资料保持不变。',
      suggestedAction: '请重新读取作品设置，确认定稿来源和可用智能连接后重试。',
    };
  if (code.startsWith('TASK_'))
    return {
      title: '后台任务未完成',
      message: '任务状态已经变化，或当前阶段不支持该操作。',
      suggestedAction: '请刷新任务状态后重试。',
    };
  return null;
}

export function authorErrorMessage(code: string, _fallbackMessage?: string): AuthorErrorMessage {
  return (
    AUTHOR_ERROR_MESSAGES[code] ??
    domainErrorMessage(code) ?? {
      title: '操作未完成',
      message: '系统未能完成本次操作，现有内容保持不变。',
      suggestedAction: '请查看技术详情后重试。',
    }
  );
}

export function authorErrorSummary(error: {
  readonly code: string;
  readonly message: string;
}): string {
  const content = authorErrorMessage(error.code);
  return [content.title, content.message, content.suggestedAction].filter(Boolean).join(' ');
}
