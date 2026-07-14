# WorldForge V1.0 Provider协议规格

> 状态：Frozen  
> 目标：用最小接口统一外部API与用户已运行的本地兼容服务。

## 1. 适配器接口

```ts
interface AIProvider {
  readonly protocol: 'openai_compatible' | 'anthropic' | 'custom';
  testConnection(input: ProviderTestInput): Promise<ProviderTestResult>;
  generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}
```

适配器只负责协议转换和错误归一化，不读取项目数据库、不组装约束包、不保存Candidate或StateProposal。

## 2. 标准请求

```ts
interface GenerationRequest {
  runId: string;
  model: string;
  systemPrompt: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  maxOutputTokens: number;
  temperature?: number;
  structuredOutput?: {
    name: string;
    schema: Record<string, unknown>;
  };
  metadata: {
    taskType: string;
    promptId: string;
    promptVersion: number;
    constraintHash: string;
  };
}
```

metadata只用于本地追踪；Provider不支持时不得强制发送到远端。

## 3. 标准事件

```ts
type ProviderEvent =
  | { type: 'connected' }
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'completed'; finishReason?: string }
  | { type: 'warning'; code: string; message: string };
```

适配器遇到错误时抛出标准`WorldForgeError`，不把厂商原始错误直接传到Renderer。

## 4. OpenAI兼容协议

V1支持可配置baseUrl、模型名、Chat Completions风格请求、SSE流、可选Bearer凭据和常见JSON Schema结构化输出。

不得假设：

- 端点一定支持模型列表。
- 所有兼容服务字段完全一致。
- reasoning、seed、缓存和工具调用可用。

## 5. Anthropic协议

支持Messages请求、system映射、SSE事件转换、Token统计和认证/限流错误映射。不支持的参数必须明确忽略或返回配置错误。

## 6. Custom协议

`custom`不是任意脚本或插件接口。V1只允许仓库内明确实现、注册并通过测试的适配器。

新增适配器必须覆盖连接、生成、流式、取消、错误映射和测试，不得引入任意代码执行能力。

## 7. 结构化输出

- T0、状态提取和部分校验优先使用结构化输出。
- T1长正文优先纯文本流；仅稳定模型使用结构化分块。
- Core使用Zod验证最终结果。
- Cleaner只移除登记的协议外壳。
- 格式修复最多一次，仍失败则返回`AI_OUTPUT_INVALID_008`或保存安全诊断。

## 8. 上下文与输出预算

Provider接收已经裁剪完成的Prompt，不自行查询项目数据。

```text
estimatedInputTokens + maxOutputTokens + safetyMargin <= maxContextTokens
```

超限返回`AI_CONTEXT_OVERFLOW_007`，不得盲目发送。

## 9. 错误映射

至少归一化：连接失败、认证失败、限流、超时、上下文超限、模型不存在、输出无效、流式中断、用户取消。

原始状态码可进入安全诊断字段，不能成为Renderer业务判断依据。

## 10. 测试夹具

每个适配器必须通过：

1. 正常非流式与流式响应。
2. 空delta和多字节中文分片。
3. 认证、限流和超时。
4. 中途断流与partial Candidate。
5. 取消。
6. 无效JSON和修复失败。
7. Token统计缺失。
8. metadata类型和Prompt版本整数校验。

## 11. 版本控制

适配器变化若影响Prompt映射、结构化输出或错误语义，必须更新适配器版本、运行相关Eval、更新ModelSupportProfile并记录兼容性变化。
