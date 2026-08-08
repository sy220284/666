# M10-17 已知风险与回退边界

1. ProjectTaskBarrier 以组合方式包装权威 `TaskProtocol`，项目级 drain 不接管全局 Core drain/shutdown；后续修改必须保持这一所有权边界，禁止再次用项目子类替换生产全局 TaskProtocol。
2. 长时间不可取消任务会触发项目生命周期超时。超时路径必须保持项目打开，作者可在任务进入 terminal 后重新执行 Close/Move。
3. Startup degraded 状态保留此前权威数据，因此 UI 必须同时呈现读取失败信号，不能把保留数据理解为本次刷新成功。
4. Rhythm 缺失 Profile 的默认值属于只读内存投影；只有显式 `run/updateProfile` 才能创建或更新持久 Profile。
5. Timeline Event 编辑复用既有 Core update 分支，回归重点锁定原 `eventId`、人物角色、地点、章节、依赖与时间字段的完整回填和更新。
6. 回滚应整体回退 M10-17 产品实现与 UI 扩展，不回滚 M10-16、历史 Migration 或其他已验证任务。

首轮 Ready 暴露的 Electron E2E 退出超时已定位到全局关闭链所有权漂移，因此最终回归必须同时覆盖项目级屏障与原生 `TaskProtocol.beginDrain()/close()` 的独立收敛。以上风险由稳定错误语义、只读边界、专项 Unit/Integration/Electron E2E 与永久质量门禁约束。
