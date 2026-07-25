# M4-03 启动前基线审计

## 结论

M4-03具备可复用基础，但端到端用户能力尚未形成。实施应在既有`provider_configs`、`CredentialBroker`、受信IPC、Core Utility Process和确定性Provider Stub上扩展，禁止建设第二套配置、凭据或网络真源。

## 已有基础

- App SQLite已有`provider_configs`，只保存Provider元数据与`credential_ref`。
- Contracts已定义Provider协议、配置Schema、敏感Option键拦截、HTTP(S)且无userinfo的URL基础校验。
- Electron Main已有基于`safeStorage`的`CredentialBroker`，拒绝不可用或`basic_text`后端，密文文件使用0700目录、0600文件和原子替换。
- Renderer只能经Preload调用设置、删除和检查凭据，凭据值不会进入Core数据库。
- Core已有Provider配置Repository，但尚未接入Utility App Data Router和Renderer设置界面。
- Testkit已有正常流、Token流、断流、超时、限流、无效JSON和取消的确定性Stub。
- Provider协议、隐私日志和错误码文档已冻结，明确Provider只做协议转换、Renderer不接触网络客户端和密钥、普通日志不记录Prompt/响应/凭据。

## 实质缺口

1. 缺少统一`AIProvider`运行接口和真实OpenAI兼容、Anthropic适配器。
2. 缺少连接测试编排：URL安全、模型列表/缺失、最短生成、流式、结构化能力和延迟。
3. 缺少本机、局域网、外部端点分类及危险地址阻断；现有Schema只能阻止非HTTP(S)和URL内嵌凭据。
4. Provider配置Repository未接入Core内部路由、Main IPC、Preload与Renderer。
5. Main尚未实现“按credentialRef解析密钥→仅在请求内存传入Core→请求完成清理”的连接测试链路。
6. 现有稳定错误码缺少危险端点专用语义；Provider HTTP/SSE错误尚无统一归一化实现。
7. 设置页没有Provider管理、隐私边界提示、凭据状态和连接测试结果。
8. 缺少真实协议Stub集成、安全泄漏扫描、取消/断流/无Token统计和离线能力不受影响回归。

## 横向与纵向影响

```text
Renderer设置页
→ Preload严格命令/结果Schema
→ Electron Main受信来源校验与CredentialBroker
→ CoreSupervisor内部操作
→ Utility App Data Router
→ ProviderConfig Repository / ProviderConnectionService
→ Node fetch / SSE解析
→ 外部API或用户已运行的本地服务
```

横向影响包括公共错误码、日志字段、IPC超时语义、Preload桥接、设置导航、覆盖率与Electron安全测试。纵向链路必须保证凭据仅在Main凭据库与单次请求内存存在，Provider不可用不影响项目、编辑、搜索、恢复和导出。

## 实施边界

- 不下载、安装、启动或监管本地模型。
- 不新增WorldForge代理、云后端、任意脚本或动态插件执行。
- `custom`只允许仓库内注册并测试的适配器；当前没有已批准具体Custom协议时，注册表保持显式拒绝，不伪造通用任意请求能力。
- 不新增无消费方能力表；连接测试结果先作为即时结果返回，不建立历史统计真源。
- 不让Renderer接触实际密钥、认证头、原始Provider错误正文或网络客户端。

## 重点风险

- SSRF与危险URL：回环、RFC1918/ULA、外部HTTPS必须区分；未指定地址、组播、链路本地元数据和跨主机重定向必须安全失败。
- SSE增量：空delta、多字节中文、跨chunk事件、断流、取消和缺失usage必须可复现。
- 协议兼容：模型列表404/405不能误判Provider不可用；明确返回列表且模型缺失时必须稳定失败。
- 凭据生命周期：保存配置失败不得遗留孤立凭据；删除配置需明确是否同步删除关联凭据并保持幂等。
- 体验：局域网和外部端点必须明确说明内容离开本机；连接失败不能阻断离线写作。
