# M10-13 1.5前置边界重构与根因治理 Evidence

## 结论

M10-13 的实现边界已按最新全量架构审计完成补充治理。成熟的数据、事务、恢复与生成持久化内核保持不变；进程通信、Utility异步承载、Renderer命令所有权、跨上下文资源提交和结构永久删除业务真源已完成收敛。

## 受检实现

- 实现提交：`e36292cd517c763418ad12f4b0f7f3d033234260`
- 来源 PR：`#321`
- Core RPC：等待者绑定精确请求身份；单条响应只消费一个等待者；发送失败、超时、进程退出和Shutdown失败统一清理。
- Utility：Router执行、结构化结果、Safe Send与Drain登记进入同一Tracked Operation生命周期。
- Renderer命令：Command Coordinator统一`replace`、`join`、`reject`；共享Pending由全部活跃命令聚合所有权控制。
- 上下文隔离：Writing命令使用项目与章节前缀；项目、章节或组件卸载后统一失效旧命令与旧订阅。
- Resource归属：Bridge查询结果与当前`queryKey`绑定，跨项目旧数据不可继续作为可用结果。
- Generation：前置自动保存、Intent组装和启动请求处于同一命令作用域，章节切换可阻止旧启动继续提交。
- Candidate：读取、预览、采用、撤销、丢弃、骨架保存及Generation终态刷新均在提交前复核scope或epoch。
- Provider与项目会话：初始刷新和异步命令在卸载时统一失效。
- Structure：永久删除影响计算、外键引用阻断、planHash复核和执行由单一`StructureTrashOperationService`承担；兼容类型不再持有平行业务逻辑。
- 保留内核：SQLite、Migration、单写队列、GenerationRun持久化、Provider DNS Pinning、Credential Broker、Recovery Journal与Electron安全壳均未重写。

## 审计映射

本任务完成Core RPC、Core生命周期、Utility执行、Renderer关键命令、Renderer查询归属、数据库命令身份与结构永久删除七类高风险逻辑的统一治理。Main IPC描述、Utility协议元数据、跨域任务会话抽象和通用两阶段流程保持现有安全机制，归入后续架构治理，未在本任务中虚报为全量重构完成。

## 验收入口

永久验证命令、GitHub Actions运行和产物记录由`commands.txt`维护。Ready工作流以本manifest绑定的实现提交为受检对象；实现提交之后只允许任务卡、Runtime、任务索引和本Evidence包发生变化。合并后的最终有效状态由`main-verification`与`task-verification/M10-13`共同给出。
