# WorldForge V1.0 Provider协议规格

> 状态：Frozen with M8-05 Maintenance Addendum  
> 目标：用最小接口统一外部API与用户已运行的本地兼容服务。  
> 更新日期：2026-07-30

## 1. 适配器接口

```ts
interface AIProvider {
  readonly protocol: 'openai_compatible' | 'anthropic' | 'custom';
  testConnection(input: ProviderTestInput): Promise<ProviderTestResult>;
  generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}
```

适配器只负责协议转换和错误归一化，不读取项目数据库、不组装约束包、不保存建议稿或设定更新建议，也不维护第二套任务状态机。

生产调用必须通过`createProviderAdapter`公开工厂创建；该工厂统一包裹有界Fetch。内部基础适配器工厂只用于受控实现和测试，不得绕过资源限制直接进入生产路径。

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

新增适配器必须覆盖连接、生成、流式、取消、错误映射、安全端点分类、资源上限和测试，不得引入任意代码执行能力。

## 7. 结构化输出

- T0、状态提取和部分校验优先使用结构化输出。
- T1长正文优先纯文本流；仅对应Provider + Model + Task + PromptVersion已验证时使用结构化分块。
- Core使用Zod验证最终结果。
- Cleaner只移除登记的协议外壳。
- 格式修复最多一次，仍失败则返回`AI_OUTPUT_INVALID_008`或保存安全诊断元数据。
- 无效结构不得保存为完整建议稿或部分设定更新建议批次。

## 8. 上下文与输出预算

Provider接收已经裁剪完成的Prompt，不自行查询项目数据。

```text
estimatedInputTokens + maxOutputTokens + safetyMargin <= maxContextTokens
```

超限返回`AI_CONTEXT_OVERFLOW_007`，不得盲目发送。

Token预算只约束预期模型输出，不代替原始网络响应资源限制。

## 9. 原始响应资源上限

生产Provider请求统一执行两级限制：

| 范围 | 默认上限 | 检查方式 |
|---|---:|---|
| 单次原始HTTP响应总量 | 16 MiB | 先检查可信的`Content-Length`；无声明或声明未超限时继续累计实际流式字节 |
| 单个SSE事件 | 1 MiB | 按空行事件边界累计原始字节，兼容LF和CRLF及跨分片边界 |

规则：

1. `Content-Length`超过总量上限时，立即取消响应体并返回`AI_RESPONSE_TOO_LARGE_014`。
2. 实际读取总量超过上限时，取消底层Reader并使包装后的响应流失败。
3. `text/event-stream`中单个事件超过上限时，即使总响应尚未超限，也立即停止。
4. 没有事件分隔符的异常SSE数据仍受单事件上限保护。
5. 限制针对原始响应读取，不能等到完整`text()`、JSON解析或字符串缓冲完成后才检查。
6. 超限不得保存完整建议稿、设定更新建议或原始响应正文。
7. 超限错误不可复用`AI_OUTPUT_INVALID_008`；后者只表达输出Schema或业务内容无效。
8. 自定义适配器不得自行替换为无界Fetch。

上限调整属于安全与性能决策，必须同时更新代码常量、协议、安全测试、威胁模型和性能证据。

## 10. 凭据与请求内存

- Provider只接收由Credential Broker解析出的请求期凭据值，不读取凭据文件或`credentialRef`。
- 凭据不得进入请求metadata、URL查询串、日志、错误details或Renderer事件。
- 请求完成、取消、超时、超限和异常后清理可控凭据引用。
- 无密钥本地服务必须支持空认证配置。

## 11. 取消、迟到事件与未完成建议稿

- `AbortSignal`是统一取消入口。
- 取消后适配器应尽快终止网络请求；无法立即终止时，迟到事件仍需被消费或丢弃。
- TaskProtocol在取消代次后不得把未来delta交付Renderer。
- Provider适配器不决定是否保存未完成建议稿；作者命令和GenerationRun事务负责保存或丢弃。
- `state_extract`取消、断流或响应超限不得创建部分设定更新建议批次。
- 资源超限由有界Fetch主动取消底层Reader，不等待用户取消。

## 12. 错误映射

至少归一化：连接失败、认证失败、限流、超时、上下文超限、模型不存在、输出无效、流式中断、用户取消、危险端点和响应超限。

| 场景 | 错误码 |
|---|---|
| JSON或结构化输出不符合目标Schema | `AI_OUTPUT_INVALID_008` |
| Provider流提前结束且未完成 | `AI_STREAM_INTERRUPTED_009` |
| Provider端点、协议或重定向不安全 | `AI_ENDPOINT_UNSAFE_013` |
| 原始响应总量或单个SSE事件超过上限 | `AI_RESPONSE_TOO_LARGE_014` |

原始状态码可进入安全诊断字段，不能成为Renderer业务判断依据。原始响应正文、认证头和厂商错误中的敏感字段必须过滤。

## 13. 测试夹具

每个适配器必须通过：

1. 正常非流式与流式响应。
2. 空delta和多字节中文分片。
3. 认证、限流和超时。
4. 中途断流与未完成建议稿处理接线。
5. 取消和迟到delta阻断。
6. 无效JSON和修复失败。
7. Token统计缺失。
8. metadata类型和Prompt版本整数校验。
9. 本机、局域网、外部和危险端点分类。
10. 凭据与原始响应不进入日志或Renderer。
11. 声明`Content-Length`超过总量上限。
12. 无长度声明的实际流式响应超过总量上限。
13. 未分隔或跨分片SSE事件超过单事件上限。
14. 超限后底层Reader被取消，错误码为`AI_RESPONSE_TOO_LARGE_014`。

## 14. 版本控制

适配器变化若影响Prompt映射、结构化输出、流式事件、错误语义或响应资源限制，必须：

1. 更新适配器版本或兼容标识。
2. 运行协议测试和受影响Eval。
3. 更新ModelSupportProfile。
4. 记录兼容性变化和降级行为。
5. 保持历史GenerationRun可按原Provider、Model、Prompt版本解释。
6. 同步`ERROR_CODES.md`、`THREAT_MODEL.md`和`SECURITY_TEST_CASES.md`。
