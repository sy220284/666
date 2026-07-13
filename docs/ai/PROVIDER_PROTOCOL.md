# WorldForge Provider协议规格

> 状态：Approved  
> 目标：用最小接口统一外部API与已运行的本地兼容服务，不提前建设通用模型平台。

## 1. 适配器接口

```ts
interface AIProvider {
  readonly protocol: 'openai_compatible' | 'anthropic' | 'custom';

  testConnection(input: ProviderTestInput): Promise<ProviderTestResult>;

  generate(
    request: GenerationRequest,
    signal: AbortSignal
  ): AsyncIterable<ProviderEvent>;
}
```

适配器只负责协议转换和错误归一化，不读取项目数据库、不组装约束包、不直接保存Candidate。

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
    promptVersion: string;
    constraintHash: string;
  };
}
```

`metadata`只用于本地追踪，Provider不支持时不得强制发送。

## 3. 标准事件

```ts
type ProviderEvent =
  | { type: 'connected' }
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'completed'; finishReason?: string }
  | { type: 'warning'; code: string; message: string };
```

Provider适配器遇到错误时抛出标准`WorldForgeError`，不把厂商原始错误直接传到Renderer。

## 4. OpenAI兼容协议

V1支持：

- 可配置`baseUrl`。
- 模型名。
- Chat Completions风格请求。
- SSE流式响应。
- 常见JSON Schema结构化输出；不支持时使用Prompt约束与本地解析。
- Bearer凭据可选。

不假设：

- 端点一定支持模型列表。
- 所有兼容服务字段完全一致。
- reasoning、seed、缓存和工具调用可用。

## 5. Anthropic协议

V1支持：

- Messages请求。
- system字段映射。
- SSE事件转换为统一delta。
- Token使用量归一化。
- 认证和限流错误映射。

不支持的参数必须明确忽略或返回配置错误，不得静默改义。

## 6. Custom协议

`custom`不是任意脚本或插件接口。V1只允许仓库内明确实现并经过测试的适配器，通过`protocolId`注册。用户不能在设置页输入任意代码。

新增Custom适配器必须：

1. 有真实Provider需求。
2. 实现连接、生成、流式、取消、错误映射和测试。
3. 不增加与现有任务无关的能力位。

## 7. 结构化输出

- T0、状态提取和部分校验优先使用结构化输出。
- Core使用Zod验证最终结果。
- 模型返回Markdown代码块时可进行有限清理，但不得无限猜测修复。
- 验证失败可在同一Run中进行一次明确修复重试，仍失败则保存原始Candidate诊断信息或报错。
- 原始响应默认不进入普通日志。

## 8. 上下文与输出预算

Provider适配器接收已经裁剪完成的Prompt，不自行查询项目数据。

Core在发起前校验：

```text
estimatedInputTokens + maxOutputTokens + safetyMargin <= maxContextTokens
```

超限时返回`AI_CONTEXT_OVERFLOW_007`并附裁剪建议，不盲目发送。

## 9. 错误映射

至少归一化：

- 连接失败。
- 认证失败。
- 限流。
- 超时。
- 上下文超限。
- 模型不存在。
- 输出格式无效。
- 流式中断。
- 用户取消。

Provider原始状态码可进入安全诊断字段，但不作为Renderer业务判断依据。

## 10. 测试夹具

每个适配器必须通过：

1. 正常非流式响应。
2. 正常流式响应。
3. 空delta和多字节中文分片。
4. 认证错误。
5. 限流和重试提示。
6. 首Token超时。
7. 中途断流与partial Candidate。
8. 取消。
9. 无效JSON与修复失败。
10. Token统计缺失。

## 11. 版本控制

Provider适配器变化若影响Prompt映射、结构化输出或错误语义，必须：

- 更新适配器版本。
- 重新运行相关模型Eval。
- 更新ModelSupportProfile。
- 记录兼容性变化。
