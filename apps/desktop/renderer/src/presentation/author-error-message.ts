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
