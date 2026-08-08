# M10-17 已知风险与回退边界

1. ProjectTaskBarrier 以组合方式包装权威 `TaskProtocol`，项目级 drain 不接管全局 Core drain/shutdown；后续修改必须保持这一所有权边界，禁止再次用项目子类替换生产全局 TaskProtocol。
2. Task event MessagePort 属于应用会话级长连接；项目切换只能改变 `listActive(projectId)` 快照作用域，不得把 `projectId` 放回 subscription effect 依赖并反复销毁/重建 MessagePort。
3. 长时间不可取消任务会触发项目生命周期超时。超时路径必须保持项目打开，作者可在任务进入 terminal 后重新执行 Close/Move。
4. Startup degraded 状态保留此前权威数据，因此 UI 必须同时呈现读取失败信号，不能把保留数据理解为本次刷新成功。
5. Rhythm 缺失 Profile 的默认值属于只读内存投影；只有显式 `run/updateProfile` 才能创建或更新持久 Profile。
6. Timeline Event 编辑复用既有 Core update 分支，回归重点锁定原 `eventId`、人物角色、地点、章节、依赖与时间字段的完整回填和更新。
7. 前两轮 Ready Electron E2E 的最终 `closeGracefully()` 错误会覆盖更早的项目 UI 首错；后续排障必须先读取 trace 中第一个 error，禁止仅按最终异常判断根因。
8. 回滚应整体回退 M10-17 产品实现与 UI 扩展，不回滚 M10-16、历史 Migration 或其他已验证任务。

最终回归必须同时覆盖项目级屏障、原生 `TaskProtocol.beginDrain()/close()`、稳定 Task MessagePort、project-scoped `listActive` 重同步，以及真实 Electron 创建项目后的 Writing/Planning/Continuity 页面可达性。以上风险由稳定错误语义、专项 Unit/Integration/Electron E2E 与永久质量门禁约束。
