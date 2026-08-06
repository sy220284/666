# 已知风险与回退

## 风险

1. Core RPC等待者保存在进程内存中。进程退出会拒绝全部请求，调用方必须通过现有重试或重新发起机制恢复；不得把等待者持久化成第二套业务真源。
2. 新增Utility异步命令必须通过Tracked Operation和Safe Send。直接在Router中裸用Promise、分散`.then/.catch`或单独维护Drain会重新引入未消费拒绝与生命周期分裂。
3. Renderer Command Coordinator依赖稳定的Owner、Key和Token。后续拆分组件时必须保持所有权跨重渲染稳定，旧Token不得释放新Pending或覆盖新上下文。
4. Recovery概览依据活动项目的`databaseMode`区分可写数据库与只读恢复模式。未来新增模式时必须显式定义可用性语义，禁止重新以空数组吞掉读取错误。
5. Provider设置控制层是刷新、命令互斥和作者提示的单一状态所有者。TSX不得重新复制并行协调逻辑。
6. Rewrite Block重复ID守卫位于受信IPC入口。新增生成入口或批量改写入口必须复用同一契约，不能只在UI侧校验。
7. Quality工作流对同一PR启用并发取消。长时间E2E执行期间改变Draft/Ready状态会取消当前运行；最终收口顺序固定为先提交Evidence，再转Ready运行完整矩阵。
8. Windows Native IME与Package Smoke按永久路径路由执行。本任务未修改对应输入，因此未触发专项矩阵；这不替代相关任务已有验证。
9. 本任务没有Migration变更。未来涉及数据库结构或持久化语义的功能必须使用独立任务和Migration审查。

## 回退

按Core RPC、Utility承载、Renderer协调、Provider控制层、Recovery可用性、Rewrite契约、Autosave提示和Best Effort日志边界分别整体回退，并同步回退对应调用点与测试。

回退不得恢复响应交叉匹配、未消费拒绝、日志污染业务结果、旧命令释放新Pending、Provider页面多套协调逻辑、重复Rewrite Block、可写数据库错误伪装为空数据，或破坏只读恢复模式。
