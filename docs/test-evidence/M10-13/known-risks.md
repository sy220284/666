# 已知风险与回退

## 风险

1. Core RPC等待者保存在进程内存中。进程退出会拒绝全部请求，调用方应通过现有重试或重新发起机制恢复，禁止把等待者持久化为第二套业务真源。
2. Utility异步命令必须经过Tracked Operation和Safe Send。Router中裸用Promise、分散维护Drain或绕开统一结果构造会重新引入未消费拒绝与生命周期分裂。
3. Renderer Command Coordinator依赖稳定Owner、上下文Key和Token。新增命令必须声明并发策略；共享Pending不得由调用点直接写回`false`。
4. Writing上下文前缀由`projectId`与`chapterId`组成。新增项目级、卷级或跨章节操作时必须选择匹配的资源作用域，禁止复用错误粒度的Key。
5. Bridge Resource只允许当前`queryKey`拥有解析结果。新增缓存层时必须显式保存来源Key，不能用保留旧data的方式伪装加载体验。
6. Candidate采用与Generation启动仍依赖权威Draft revision、内容Hash和服务端事务复核。Renderer上下文失效只负责界面提交权，不能替代Core冲突检测。
7. 结构永久删除的兼容类仅用于保持依赖注入名称。任何新的影响计算、引用阻断或执行逻辑必须进入`StructureTrashOperationService`，禁止重新在兼容入口复制SQL。
8. Recovery概览依据活动项目`databaseMode`区分可写数据库与只读恢复模式。新增模式时必须显式定义可用性语义，禁止以空数组吞掉读取错误。
9. Quality工作流对同一PR启用并发取消。修改Head或切换Draft/Ready会取消当前运行；最终判定只采用最新Head对应的完整矩阵。
10. 本任务未修改Migration、锁文件和生产依赖。后续涉及数据库结构或持久化语义的功能必须使用独立任务和Migration审查。
11. 最新全量架构审计中的Main IPC描述、Utility协议元数据、通用异步任务会话与跨域两阶段抽象未在本任务整体重写；现有契约、事务和测试继续作为安全边界，后续任务应按优先级治理。

## 回退

按Core RPC、Utility承载、Renderer协调、Resource归属、Provider/项目生命周期、Generation/Candidate上下文和结构永久删除引擎分别整体回退，并同步回退对应调用点与测试。

回退不得恢复响应交叉匹配、未消费拒绝、日志污染业务结果、旧命令释放新Pending、跨项目或章节旧结果回写、旧Resource继续可用、自动保存结束后启动旧Generation、结构永久删除双源、重复Rewrite Block或可写数据库错误伪装为空数据。
