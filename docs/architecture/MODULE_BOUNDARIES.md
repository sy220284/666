# WorldForge 模块边界

> 状态：Frozen  
> 目标：防止业务逻辑、Electron能力、数据库和UI相互渗透。

## 1. 依赖方向

```text
apps/desktop/main ───────┐
apps/desktop/preload ────┼──> packages/contracts
apps/desktop/renderer ───┘        ↑
        │                          │
        ├──> packages/editor-core  │
        └──> packages/domain ──────┤
                                   │
packages/core-service ─────────────┘
        ├──> packages/domain
        ├──> packages/prompts
        └──> packages/contracts

packages/testkit 可被测试代码使用，不进入生产运行依赖。
```

禁止形成环形依赖。

## 2. `packages/contracts`

允许：

- Zod Schema。
- IPC请求/响应/事件类型。
- 错误码。
- AI结构化输出Schema。
- 导入导出Manifest Schema。

禁止：

- Repository和SQL。
- Electron具体实现。
- React组件。
- 业务Use Case。
- Prompt正文。

## 3. `packages/domain`

允许：

- 领域实体、值对象和枚举。
- 纯函数不变量。
- 状态迁移规则。
- Block Patch和业务校验的纯模型。

禁止：

- Electron、React、SQLite、Node文件系统。
- 网络请求。
- 全局单例和环境变量读取。

领域层测试必须无需Electron和数据库即可运行。

## 4. `packages/core-service`

允许：

- SQLite连接、Repository、Migration和写队列。
- 文件、导入导出、备份和恢复。
- Provider Adapter和AI任务管线。
- FTS5、校验和业务Use Case。
- 任务注册与事件发送。

禁止：

- React组件和DOM。
- 直接操作BrowserWindow。
- 依赖Renderer Store。
- 将Provider响应直接写Draft。

## 5. `packages/editor-core`

允许：

- Tiptap/ProseMirror扩展。
- 节点Schema。
- 编辑事务与Block Patch转换。
- IME、粘贴、查找和锁定UI插件。
- 中文Diff纯算法可放子模块。

禁止：

- 直接访问SQLite和文件。
- 调用Provider。
- 保存Credential。
- 决定权威Revision提交结果。

Core最终决定Patch是否可提交。

## 6. `packages/prompts`

允许：

- Prompt模板和版本。
- 约束包序列化。
- 语义化文风转译。
- Few-shot样本选择格式。
- 模型输出清理和结构化解析。

禁止：

- 查询数据库。
- 调用Provider。
- 修改Candidate、Draft和状态。
- 在模板中硬编码私人作品内容。

## 7. `packages/testkit`

包含：

- 临时工作空间和数据库工厂。
- Provider Stub与流式故障注入。
- Migration Fixture。
- 中文长文本和大项目模拟数据。
- 日志敏感内容扫描器。

生产代码不得依赖`testkit`。

## 8. Electron三层边界

### Main

只能处理窗口、生命周期、OS能力、Core监管和系统凭据代理。

### Preload

只能暴露白名单契约，不包含业务决策。

### Renderer

只能发命令、展示状态和维护未提交UI状态。不得直接操作权威数据。

## 9. Repository边界

- Repository只处理持久化，不编排跨领域业务。
- 跨表事务由Use Case控制。
- 业务层不能接收任意SQL、表名和列名。
- 所有Repository方法显式要求`projectId`或绑定到一个ProjectDatabase实例。
- Version Repository不提供更新已存在Version正文的方法。

## 10. Use Case边界

一个写Use Case必须明确：

1. 输入Schema。
2. 项目范围。
3. 读取集。
4. 事务写入集。
5. Revision/Hash/Lock检查。
6. 错误码。
7. 需要的恢复点。
8. 事件输出。

UI组件不得跨多个Repository模拟业务事务。

## 11. Provider边界

Provider Adapter只做协议转换：

```text
标准GenerationRequest ↔ 厂商协议 ↔ 标准ProviderEvent/错误
```

约束包、Prompt版本、Candidate保存和模型支持等级由Core其他模块处理。

## 12. 允许的例外

任何新增跨层依赖必须有真实阻断问题，并在任务卡中写明：

- 现有边界为何无法实现。
- 最小替代方案为何不足。
- 新依赖会增加哪些测试和风险。

未经批准不得为了“方便”直接导入内部模块。

## 13. 自动检查建议

- ESLint boundaries或自定义脚本检查包依赖。
- 禁止Renderer导入`better-sqlite3`、`fs`、`child_process`和Credential实现。
- 禁止Domain导入Electron、React和Node API。
- 禁止生产包导入`testkit`。
- 禁止深层路径绕过包公开入口。
