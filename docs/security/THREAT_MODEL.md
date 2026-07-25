# WorldForge 威胁模型

> 状态：Approved  
> 适用：V1.0桌面单用户、本地优先架构  
> 更新日期：2026-07-25

## 1. 保护资产

- 未发布作品正文、Candidate和历史Version。
- 人物、世界观、时间线、伏笔、StateProposal证据和研究资料。
- 项目数据库、备份与导出文件。
- API凭据及其密文。
- 作者手动锁定内容。
- 项目路径与本地附件。
- AI请求中的上下文、Prompt与模型响应。
- GenerationRun、Prompt版本和约束来源审计链。

## 2. 信任边界

```text
用户
  ↓
Renderer（不可信输入与展示层）
  ↓ 白名单Preload
Electron Main / Core Service（受信任执行层）
  ↓
SQLite / 项目文件 / safeStorage保护的凭据文件
  ↓ 用户主动配置
外部API或本地模型服务（外部信任域）
```

Renderer展示的数据和所有用户输入均需验证。Provider服务无论在本机、局域网还是外部，都不视为权威数据源。

## 3. 主要威胁与缓解

| ID     | 威胁 | 影响 | 缓解 |
| ------ | ---- | ---- | ---- |
| TM-001 | Renderer获得Node或文件能力 | 任意读取本机文件 | 关闭Node集成、启用隔离与sandbox、最小Preload |
| TM-002 | 任意IPC通道或输入未校验 | 越权调用Core能力 | 具名白名单、strict Zod校验、协议版本和命令注册表 |
| TM-003 | 路径穿越或符号链接越界 | 读取/覆盖项目外文件 | Core规范化路径、真实路径检查、允许根目录校验 |
| TM-004 | 跨项目ID混用 | 作品数据串读串写 | 项目作用域、实体归属、章节归属和Repository强制校验 |
| TM-005 | AI直接覆盖Draft | 作者正文丢失 | Candidate隔离、明确接受、Revision/Hash/LockGuard |
| TM-006 | 旧Candidate覆盖新编辑 | 静默回退作者修改 | baseRevision、expectedHash、ConflictSet |
| TM-007 | 锁定块被批量操作修改 | 关键文本破坏 | Tiptap事务过滤、Core统一LockGuard、整批Patch回滚 |
| TM-008 | DOCX解包异常内容 | 资源耗尽或越界写入 | 限制大小、数量、压缩比、深度和路径；忽略嵌入对象与外部资源 |
| TM-009 | 凭据写入数据库、Renderer、日志或错误 | 密钥泄露 | safeStorage安全后端、受限密文文件、credentialRef、日志脱敏、错误白名单 |
| TM-010 | safeStorage不可用或使用不安全后端 | 凭据以弱保护形式落盘 | `isEncryptionAvailable`检查；`basic_text`等后端直接阻断 |
| TM-011 | 外部模型端点记录内容 | 作品泄露到第三方 | 明确端点类型、用户主动配置、本机直连、发送类别提示 |
| TM-012 | 危险Provider URL或重定向 | SSRF、本地资源探测、数据外送 | 协议白名单、端点分类、危险地址阻断、跨主机重定向拒绝 |
| TM-013 | 数据库损坏或断电 | 丢稿 | WAL、单写队列、事务、完整性检查和三轨备份 |
| TM-014 | 恢复覆盖原项目 | 二次数据损失 | 默认恢复到新目录，验证后注册为新项目 |
| TM-015 | 日志或诊断包包含正文/Prompt/响应 | 隐私泄露 | 默认只记ID、耗时、计数和Hash；导出前白名单与用户确认 |
| TM-016 | 远程页面在应用内加载 | 页面利用桌面权限 | 禁止导航、新窗口和远程内容；外链系统浏览器打开 |
| TM-017 | 恶意导出路径 | 覆盖关键文件 | 系统选择器、目标确认、临时文件和原子重命名 |
| TM-018 | Skeleton被当作正文Candidate采用 | 结构化规划污染Draft | 判别式Candidate合同、Core类型守卫、Apply/Version/定稿拒绝 |
| TM-019 | partial被误作完整稿 | 截断正文被整稿采用或定稿 | completeness硬字段、整稿采用/定稿拒绝、显式补全流程 |
| TM-020 | AI状态提取直接写权威状态 | 人物状态和弧光被未经确认推进 | 只允许pending StateProposal，作者裁决后单事务更新 |
| TM-021 | pending提案进入约束或校验 | 未确认建议冒充事实 | 权威查询过滤、状态类型校验、M6-02只读已确认状态 |
| TM-022 | 取消后迟到delta污染界面 | 已取消内容串入新任务或章节 | Task代次、Abort、迟到事件消费、Renderer交付阻断 |
| TM-023 | GenerationRun与结果引用断裂 | 审计失真、孤立Candidate或提案 | Run与结果原子收口、外键/完整性检查、重启权威查询 |
| TM-024 | 继续写作状态保存正文 | 应用级偏好泄露作品内容 | 只保存项目、章节、光标、滚动和最小视图状态 |
| TM-025 | 写作统计混入AI/导入/恢复 | 误导作者产出和节奏判断 | mutationOrigin或WritingSession，非人工来源全部排除 |

## 4. Electron安全要求

```ts
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  preload: PRELOAD_PATH
}
```

还必须：

- 严格CSP，不允许`unsafe-eval`进入正式构建。
- 拦截`will-navigate`、`setWindowOpenHandler`和下载行为。
- 不加载用户提供的HTML为应用页面。
- 正式构建受控开放DevTools。
- Electron Fuses在安全测试中持续验证。
- MessagePort、Provider和Generation IPC只暴露具名、可验证、可撤销的最小能力。

## 5. 数据库与文件威胁

- 每个项目使用独立数据库和目录。
- 写队列不接受原始SQL、表名或路径作为Renderer输入。
- 备份使用SQLite Online Backup，不直接复制打开中的数据库。
- Migration、导入、Candidate采用、批量替换和结构操作前创建恢复点。
- FTS、统计、摘要和缓存损坏时重建，不反向污染业务表。
- Skeleton Payload与Prose CandidateBlock分离，类型转换必须通过明确业务命令。
- GenerationRun成功与Candidate或StateProposal结果引用原子提交。
- 批量替换只修改活动DraftBlock；Version不可变，Entity使用专用命令。
- 三轨备份清理保护最后已验证备份、永久恢复点和作者保留快照。

## 6. AI边界

- Prompt中的“不要修改锁定段落”只是质量提示，真正保护由Core完成。
- Renderer锁定样式和禁用态不是权限边界；绕过Editor直接调用Core仍执行Revision、Hash、归属、Candidate类型与LockGuard校验。
- 同一Patch只要存在一个锁定冲突就不持久化任何操作；IPC仅返回安全冲突信息，不返回正文。
- 模型输出必须经过Schema解析和业务校验。
- T1输入只允许持久化Skeleton、权威SceneBeat或直接章节目标，不接受伪造SceneBeat。
- Skeleton只能用于规划、比较、编辑和T1输入。
- partial只能显式补全、保存或丢弃，不能默认作为完整稿。
- AI状态提取只生成pending提案，`previousValue`由Core计算。
- pending提案不参与权威连续性、弧光或语义校验。
- AI日记、摘要、校验和统计均为派生数据。
- 未验证模型不允许绕过代码硬保证。

## 7. 凭据与网络边界

- Credential Broker通过Electron `safeStorage`安全后端加密，密文落盘但不进入数据库。
- 凭据文件与目录使用平台可达的最小权限。
- 凭据值只在请求期受控内存存在，不发送给Renderer。
- Provider配置区分本机、局域网和外部端点。
- 禁止`file://`、应用内部协议、任意本地文件、云元数据地址和未批准Custom脚本。
- 跨主机重定向默认拒绝。
- 外部Provider如何保存请求属于剩余风险，必须由界面明确提示。

## 8. 剩余风险

V1.0不解决：

- 设备被完全控制后的本地数据保密。
- 用户自行配置的不可信模型服务如何处理请求。
- 用户自行将项目放入第三方同步盘后的冲突。
- 未启用磁盘加密时共享设备上的明文项目数据库访问。
- 操作系统安全加密后端本身被破坏后的凭据保密。

这些风险需要在用户文档中明确，不得误导为“绝对安全”。

## 9. 安全验收

- Renderer访问`require`、`process`、数据库和文件系统失败。
- 未注册IPC和非法字段被拒绝。
- 路径越界、符号链接逃逸、危险Provider端点和跨项目ID测试失败关闭。
- 锁定、Candidate隔离、Skeleton类型、partial限制和Revision冲突硬保证为0缺陷。
- AI直接写权威状态、pending冒充事实和跨项目提案成功次数为0。
- 取消后未来delta进入Renderer次数为0。
- Run—Candidate—StateProposal—Prompt—约束引用完整。
- 导入异常文件不写项目、不留下临时内容。
- safeStorage不可用和不安全后端时凭据操作被阻断。
- 默认日志、诊断包和继续写作状态扫描不含正文与凭据。
- 写作统计不混入AI、导入、替换、恢复、结构和系统操作。

## 10. 本地文本与DOCX文件边界

- Renderer无任意路径能力；源文件和目标目录只由Electron Main系统选择器产生。
- Core拒绝非绝对路径、符号链接、非普通文件、未知扩展、二进制NUL、空内容和超限输入。
- 自动检测采用严格解码；低置信度编码必须在预览界面可见并允许人工重选。
- ImportPlan绑定源文件Hash并设置有效期，文件变化或过期阻止提交。
- DOCX限制解包总量、文件数、压缩比、嵌套深度和关系目标，忽略宏、OLE和外部资源。
- 导出文件名禁止路径分隔符、控制字符和`..`；同名文件绝不静默覆盖。
- 导出经同目录临时文件、内容Hash验证和原子重命名完成，失败清理临时文件。
