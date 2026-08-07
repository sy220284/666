# 已知风险与回退

## 风险

1. Core RPC 等待者保存在进程内存中；进程退出会拒绝全部请求，调用方通过既有重试或重新发起机制恢复。
2. Utility 异步命令必须经过 Tracked Operation 与 Safe Send，禁止 Router 裸用 Promise 或分散维护 Drain。
3. Renderer 命令必须声明作用域和 `replace`、`join`、`reject` 策略；共享忙碌状态禁止由单个调用点直接释放。
4. 项目打开、关闭、移动等不可撤销副作用必须互斥执行，禁止使用 latest-wins 覆盖已经发生的 Core 操作。
5. Writing 状态提交必须同时验证项目、章节、Draft、Revision、编辑器代次或组件会话；上下文失效后不得触发续写保存或状态反馈。
6. Bridge Resource 刷新必须进入真实 Loading 并清除旧数据；新增缓存层必须显式保存来源 key。
7. Candidate 采用与 Generation 启动继续依赖权威 Revision、内容 Hash 和 Core 事务复核；Renderer 失效机制不能替代服务端冲突检测。
8. 结构永久删除的兼容类型只保留依赖注入名称；新影响计算、引用阻断与执行逻辑必须进入 `StructureTrashOperationService`。
9. Quality 工作流对同一 PR 启用并发取消；最终判定只采用最新 Head 对应的完整矩阵。
10. 本任务未修改 Migration、锁文件和生产依赖。
11. Main IPC 描述、Utility 协议元数据、通用任务会话与跨域两阶段抽象仍属于后续治理范围。
12. Electron E2E 当前串行运行 33 项，耗时约 13.5 分钟；后续并行化必须保持项目数据目录、端口、显示矩阵和截图证据相互隔离。

## 回退

按 Core RPC、Utility 承载、Renderer Coordinator、Resource 归属、项目会话、Writing 生命周期、Provider/Generation 订阅和结构删除引擎分别整体回退，并同步回退对应调用点与测试。

回退不得恢复响应交叉匹配、未消费拒绝、旧命令释放新忙碌状态、项目副作用并发覆盖、跨项目或章节旧结果回写、旧 Draft 触发续写副作用、旧 Resource 继续可用、章节卸载后挂载旧正文、结构永久删除双源或可写数据库错误伪装为空数据。
