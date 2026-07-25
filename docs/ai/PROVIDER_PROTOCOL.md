# WorldForge V1.0 Provider协议规格

> 状态：Frozen  
> 目标：用最小接口统一外部API与用户已运行的本地兼容服务。  
> 更新日期：2026-07-25

## 1. 适配器接口

```ts
interface AIProvider {
  readonly protocol: 'openai_compatible' | 'anthropic' | 'custom';
  testConnection(input: ProviderTestInput): Promise<ProviderTestResult>;
  generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}
```

适配器只负责协议转换和错误归一化，不读取项目数据库、不组装约束包、不保存Candidate或StateProposal，也不维护第二套任务状态机。

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

`metadata`用于本地GenerationRun追踪；远端协议不支持时不得强制发送。不得把项目ID、章节ID、内部路径、凭据引用或不必要的本地元数据发送给Provider。

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

Provider事件由既有TaskProtocol接收、批处理和分发；Provider适配器不得直接操作Renderer或持久化运行状态。

## 4. OpenAI兼容协议

V1支持可配置`baseUrl`、模型名、Chat Completions风格请求、SSE流、可选Bearer凭据和常见JSON Schema结构化输出。

不得假设：

- 端点一定支持模型列表。
- 所有兼容服务字段完全一致。
- reasoning、seed、缓存和工具调用可用。
- 连接测试通过等于任务级结构化输出稳定。

## 5. Anthropic协议

支持Messages请求、system映射、SSE事件转换、Token统计和认证/限流错误映射。不支持的参数必须明确忽略或返回配置错误。

## 6. Custom协议

`custom`不是任意脚本或插件接口。V1只允许仓库内明确实现、注册并通过测试的适配器。

新增适配器必须覆盖连接、生成、流式、取消、错误映射、安全端点分类和测试，不得引入任意代码执行能力。

## 7. 结构化输出

- T0、状态提取和部分校验优先使用结构化输出。
- T1长正文优先纯文本流；仅对应Provider + Model + Task + PromptVersion已验证时使用结构化分块。
- Core使用Zod验证最终结果。
- Cleaner只移除登记的协议外壳。
- 格式修复最多一次，仍失败则返回`AI_OUTPUT_INVALID_008`或保存安全诊断元数据。
- 无效结构不得保存为完整Candidate或部分StateProposal批次。

## 8. 上下文与输出预算

Provider接收已经裁剪完成的Prompt，不自行查询项目数据。

```text
estimatedInputTokens + maxOutputTokens + safetyMargin <= maxContextTokens
```

超限返回`AI_CONTEXT_OVERFLOW_007`，不得盲目发送。

## 9. 凭据与请求内存

- Provider只接收由Credential Broker解析出的请求期凭据值，不读取凭据文件或`credentialRef`。
- 凭据不得进入请求metadata、URL查询串、日志、错误details或Renderer事件。
- 请求完成、取消、超时和异常后清理可控凭据引用。
- 无密钥本地服务必须支持空认证配置。

## 10. 取消、迟到事件与partial

- `AbortSignal`是统一取消入口。
- 取消后适配器应尽快终止网络请求；无法立即终止时，迟到事件仍需被消费。
- TaskProtocol在取消代次后不得把未来delta交付Renderer。
- Provider适配器不决定是否保存partial；作者命令和M4-05 GenerationRun事务负责保存或丢弃。
- `state_extract`取消或断流不得创建部分StateProposal批次。

## 11. 错误映射

至少归一化：连接失败、认证失败、限流、超时、上下文超限、模型不存在、输出无效、流式中断、用户取消和危险端点。

原始状态码可进入安全诊断字段，不能成为Renderer业务判断依据。原始响应正文、认证头和厂商错误中的敏感字段必须过滤。

## 12. 测试夹具

每个适配器必须通过：

1. 正常非流式与流式响应。
2. 空delta和多字节中文分片。
3. 认证、限流和超时。
4. 中途断流与partial Candidate处理接线。
5. 取消和迟到delta阻断。
6. 无效JSON和修复失败。
7. Token统计缺失。
8. metadata类型和Prompt版本整数校验。
9. 本机、局域网、外部和危险端点分类。
10. 凭据与原始响应不进入日志或Renderer。

## 13. 版本控制

适配器变化若影响Prompt映射、结构化输出、流式事件或错误语义，必须：

1. 更新适配器版本或兼容标识。
2. 运行协议测试和受影响Eval。
3. 更新ModelSupportProfile。
4. 记录兼容性变化和降级行为。
5. 保持历史GenerationRun可按原Provider、Model、Prompt版本解释。
