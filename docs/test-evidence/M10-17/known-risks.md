# M10-17 已知风险与回退边界

1. ProjectTaskBarrier 采用项目级 drain guard，长时间不可取消任务会触发生命周期超时。超时路径必须保持项目打开，作者可在任务进入 terminal 后重新执行 Close/Move。
2. Startup degraded 状态保留此前权威数据，因此 UI 必须同时呈现读取失败信号，不能把保留数据理解为本次刷新成功。
3. Rhythm 缺失 Profile 的默认值属于只读内存投影；只有显式 `run/updateProfile` 才能创建或更新持久 Profile。
4. Timeline Event 编辑复用既有 Core update 分支，回归重点锁定原 `eventId`、人物角色、地点、章节、依赖与时间字段的完整回填和更新。
5. 回滚应整体回退 M10-17 产品实现与 UI 扩展，不回滚 M10-16、历史 Migration 或其他已验证任务。

这些风险均由稳定错误语义、只读边界、专项 Unit/Integration/Electron E2E 与永久质量门禁约束。
