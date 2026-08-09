# M10-21 已知风险与回退边界

- `latestProjectMigrationVersion()` 以受控 `migrations/project` 序列为权威；新增 Migration 后测试自动读取新版本，不再复制数字。若 Migration 序列出现缺号或重复，Core Migration loader 继续 fail-closed。
- `materializeProjectMigrationsThrough()` 只为测试正向复制目标版本及以前的 SQL；它不执行 Migration，也不进入产品运行路径。
- AR 测试不再以文件行数决定合并资格；循环依赖、Owner、组合根、依赖方向、Feature 私有边界和禁止能力仍由结构语义检查约束。
- 源码文本扫描仅保留禁止 SQL 下沉、禁止复制删除实现等安全不存在性边界；私有函数名、语句顺序和等价实现形态不再作为产品契约。
- 当前 `command_receipts` 的跨 Core 重启 durable replay 明确限于已声明命令；Schema 30 现阶段用于 Import，不能解释为所有写命令普遍具备持久重放。
- Performance 永久矩阵首轮出现一次 runner 瞬时事件循环抖动，原样重跑与本地全量矩阵均成功；若同一预算再次稳定失败，应单独分析运行负载或基线，不以本任务文档/测试治理扩大性能阈值。
- 本地执行环境禁止创建 Unix socket，因此 Electron E2E 的最终真实性由标准 GitHub Actions Ubuntu runner 提供；CI 运行成功且完整日志与显示证据由永久工作流保存。
- `verificationBinding.sourcePr` 必须在 Ready 闭包前填写为实际来源 PR；缺失或与 Main Verification 输入不一致时，状态发布必须 fail-closed，不得手工覆盖失败状态。本任务的最终来源绑定为 PR #331。

回退时整体回退 M10-21 的 Testkit、测试、当前权威文档、任务卡、Runtime、索引和 Evidence；不得改写 M10-20 及更早 Verified 历史记录，也不得恢复 latest schema 硬编码、倒拆历史 fixture 或固定行数 hard gate。
