# WorldForge 本地AI服务接入规格

> 状态：Frozen  
> 范围：只连接用户已运行的本地服务，不负责模型下载、安装、升级、容器、显存和进程监管。  
> 更新日期：2026-07-25

## 1. 目标

WorldForge使用统一Provider配置连接：

- 用户自行配置的外部模型API。
- 运行在本机或局域网可信环境中的OpenAI兼容服务。
- Ollama、LM Studio、llama.cpp server等用户自行维护的服务，只要暴露受支持协议。

WorldForge不建设自己的模型云服务，也不代理请求。

## 2. 配置模型

```ts
interface ProviderConfig {
  id: string;
  name: string;
  protocol: 'openai_compatible' | 'anthropic' | 'custom';
  baseUrl: string;
  model: string;
  credentialRef?: string;
  timeoutMs: number;
  advancedOptions?: Record<string, unknown>;
}
```

本地服务通常不需要密钥；需要时使用统一Credential Broker。`app.sqlite`只保存`credentialRef`，不保存明文或密文凭据。

## 3. 凭据存储

V1采用以下实际架构：

```text
明文密钥
→ Electron safeStorage调用可用的OS安全加密后端
→ 密文写入权限受限的本地凭据文件
→ app.sqlite只保存credentialRef
→ 发起请求时短暂解密到Core/Main受控内存
→ 请求完成后清理引用
```

规则：

- 凭据文件目录权限应限制为当前用户，文件权限使用平台可达的最小权限；Unix类平台目标为`0600`。
- `safeStorage.isEncryptionAvailable()`为假时阻断凭据写入和读取。
- Linux等平台若选中`basic_text`或其他不安全后端，必须阻断，不得静默明文降级。
- Renderer、Preload返回值、数据库、普通日志、诊断包和错误details不得包含凭据值或密文。
- Credential Broker损坏、并发更新和删除必须返回稳定错误，不以空值伪装成功。

## 4. 最小能力档案

```ts
interface ModelCapabilities {
  streaming: boolean;
  structuredOutput: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
}
```

V1不预建`seedSupport`、`reasoningControl`、`promptCaching`等大量能力位。只有真实任务需要时再扩展。

连接测试结果只能证明可达性和基础能力，不能直接标记任务级ModelSupportProfile为`verified`。

## 5. 连接测试

连接测试分四步：

1. URL格式、协议和端点安全检查。
2. 最小健康请求或模型列表请求。
3. 最短文本生成。
4. 流式和结构化输出能力验证。

输出：

- 可达性。
- 认证状态。
- 实际模型名。
- 流式能力。
- 结构化输出能力。
- 实测延迟。
- 端点分类与安全提示。

连接测试不保存完整请求Prompt或响应正文。

## 6. 地址与安全边界

- `localhost`、`127.0.0.1`和`::1`视为本机服务。
- 局域网IP允许配置，但界面明确提示数据将离开当前设备并进入局域网服务。
- 外部HTTPS端点视为外部API。
- 外部明文HTTP默认拒绝；开发例外必须显式、受控且不可进入正式发布默认配置。
- 禁止Provider配置访问`file://`、应用内部协议、Unix设备、任意本地文件和云元数据地址。
- 重定向到不同主机时默认拒绝，除非已批准适配器明确实现并重新执行安全分类。
- 自签名证书不默认忽略验证；开发选项需明确风险。

## 7. 请求生命周期

```text
用户发起任务
→ Core读取Provider配置
→ Main/Credential Broker按credentialRef解析凭据
→ Core组装约束包
→ 建立GenerationRun
→ 发起本机直连请求
→ 流式事件进入既有TaskProtocol/MessagePort
→ 完成后解析并原子保存Candidate或pending StateProposal
→ 清理请求内存和凭据引用
```

Renderer不直接接触Provider响应原文、密钥和网络客户端。

## 8. 超时与重试

- 连接超时、首Token超时和总请求超时分开记录。
- 默认不自动无限重试。
- 认证失败、结构不支持和上下文超限不自动重试。
- 临时网络错误和限流可由作者明确重试。
- 重试记录在同一GenerationRun的`retryCount`，用户主动重新生成创建新Run。
- 超时后不得把结果未知描述为确定失败或确定未写入；必须刷新GenerationRun权威状态。

## 9. 取消与部分结果

- Provider支持Abort时立即终止请求。
- 取消意图通过既有TaskProtocol传播，不建立Provider专属任务状态机。
- 取消后停止未来增量事件进入Renderer；迟到事件必须被消费但不能污染当前展示状态。
- 已接收文本可由作者选择保存为partial Prose Candidate或丢弃。
- partial Candidate不得标记为完整正文、默认整稿采用或直接定稿。
- state_extract取消、断流或失败不得创建部分StateProposal批次。

## 10. 模型支持等级

| 等级 | 条件 | 产品行为 |
|---|---|---|
| 已验证 | 固定Eval通过该Provider、模型、任务与Prompt版本组合 | 正常启用并显示验证时间 |
| 有限支持 | 基础生成可用，部分任务未达基线 | 对高风险任务提示限制 |
| 未验证 | 只有连接或基础生成测试 | 允许作者自行使用，不宣称稳定 |

支持等级按`Provider + Model + Task + PromptVersion`记录，不能只按模型名称概括。

## 11. 本地模型性能预期

WorldForge不承诺任何本地模型速度。UI只显示真实阶段、已运行时间和已接收字符数。只有同一Provider在本机积累足够历史数据后，才可显示“通常耗时范围”，禁止伪造倒计时。

## 12. 日志与隐私

允许记录：Run ID、Provider ID、模型名、端点分类、延迟、Token统计、错误码和Hash。

禁止默认记录：正文、完整Prompt、约束全文、密钥、密文、认证头、原始模型响应和附件内容。

作者触发AI任务前，界面应说明将发送的数据类别和目标端点类型。

## 13. 验收

- 本机OpenAI兼容Stub可完成非流式、流式、取消、超时和无效输出测试。
- 切换章节不串流，取消后无未来delta进入Renderer。
- 未配置密钥的本地服务可正常使用。
- `safeStorage`不可用或不安全后端时凭据操作被阻断。
- 凭据不会进入数据库、Renderer、普通日志和错误details。
- GenerationRun与Candidate/StateProposal结果引用完整。
- Provider不可用时不影响离线编辑、搜索、备份和导出。
