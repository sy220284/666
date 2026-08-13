import { describe, expect, it } from 'vitest';

import { authorErrorMessage } from '../../apps/desktop/renderer/src/presentation/author-error-message.js';

describe('作者错误提示', () => {
  it('将智能模型响应超限解释为安全停止而非结构解析失败', () => {
    expect(authorErrorMessage('AI_RESPONSE_TOO_LARGE_014')).toEqual({
      title: '智能模型返回内容超过安全上限',
      message: '模型服务返回的数据量过大，系统已经停止接收，正文和本地数据没有被修改。',
      suggestedAction: '请缩小生成范围、降低输出长度，或检查模型服务是否异常。',
    });
  });
});
