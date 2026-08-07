# M10-14 Recovery、Bridge与边界审计收口

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作 / V1.5 Preflight  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 来源 PR：`#323`  
> 主线基线：`d394d89766d2e85889c81f9599378e958681f3c0`  
> 最终实施提交：`119da9ac1c8ba64d049eda60b438c63bfd2ef064`

## 目标

根据 M10-13 合并后的全量代码 Review，修复剩余 Recovery fail-closed、每日备份并发、Renderer Bridge 共享读取取消语义、Provider IPv6 特殊地址分类与高风险生命周期覆盖盲区，保持已验证的数据、Migration、Generation 与安全内核不变。

## 已确认根因

1. Recovery 清理读取保留策略失败时可能退回默认策略，删除类操作缺少严格 fail-closed 前置条件；
2. Daily Backup 的跨实例去重主要依赖文件锁陈旧判断，合法长备份存在锁接管竞态，且跨午夜还需要兼顾“禁止并发”和“次日必须补备”；
3. `BridgeRequestCoordinator` 的 `share` 模式共享底层请求时丢失调用方 `AbortSignal`，并且全员取消、`cancelAll` 或单 key cancel 后存在立即重订阅复用已放弃请求的空窗；
4. Provider IPv6 分类遗漏已废弃的 `FEC0::/10` site-local 地址段；
5. `request-lifecycle.ts` 属于纯异步核心逻辑，却仍被 Coverage 排除；
6. `CheckpointAwareRecoveryService` 保留了与 RecoveryService 平行的 Daily Backup 去重状态机，形成重复所有权和 API 语义漂移。

## 实施原则

- 保留 SQLite、Migration、单写队列、Recovery 备份/恢复业务内核、Provider DNS Pinning 和 GenerationRun；
- 在公共入口修复状态所有权和 fail-closed，不复制平行业务逻辑；
- Daily Backup 只允许 RecoveryService 持有一个公共状态机：按备份根目录与项目串行，同日去重，跨午夜排队补备；底层文件锁继续承担崩溃残留协调；
- `CheckpointAwareRecoveryService` 只保留损坏项目从已验证恢复点读取/导出 Version 的专属能力，不再覆盖 Daily Backup；
- `share` 使用“共享底层请求 + 消费者独立取消”，最后一个消费者退出时取消底层等待；全员取消、`cancelAll`、单 key cancel 后的立即重订阅必须进入新代次；
- Recovery 清理和 Daily Backup 保持 Promise rejection 契约；Base Recovery Overview 保持既有数据库可用性错误传播契约，同时增加真实明细预检；
- 不降低 Coverage 阈值，不新增排除，不增加生产依赖，不修改 Migration 或锁文件。

## 完成结果

- Recovery 清理入口在读取/解析持久化策略失败时 fail-closed，`previewCleanup` / `applyCleanup` 以 Promise rejection 拒绝继续；
- Recovery Overview 在可写数据库下预检失败记录、Version 与持久化策略，详细读取故障不再被空数组或默认策略掩盖；
- Daily Backup 收敛为唯一公共 lane：同日跨实例共享，跨午夜请求等待前一日备份结束后自动补建次日恢复点；
- `CheckpointAwareRecoveryService` 的平行 Daily Backup 状态机已删除；
- Bridge `share` 支持消费者独立取消，单消费者退出不误杀其他调用方；全员退出、`cancelAll`、单 key cancel 后立即重订阅均启动新代次；
- Provider IPv6 分类阻断 `FEC0::/10` 已废弃 Site-Local 地址；
- `request-lifecycle.ts` 从 Coverage 排除中移除，并增加共享、取消、重订阅六类行为测试；
- 增加产品 Recovery 跨午夜串行/次日补备、策略读取失败关闭和 Provider IPv6 安全回归测试；
- Ready 验证过程中发现的 Recovery 错误包装、同步抛错等兼容回归均已按既有公共契约修复。

## 永久验证

最终实施提交 `119da9ac1c8ba64d049eda60b438c63bfd2ef064` 已通过：

- Quality run `31143014872`：Static、Unit、Integration、Migration、Coverage、Build、Electron E2E、聚合 Quality 全部成功；
- Security run `31143013967`：应用安全、依赖审计、Secret Scan、聚合 Security 全部成功；
- Performance run `31143013922`：性能预算、AI Eval、聚合 Performance 全部成功；
- Task Governance run `31143014509`：成功；
- PR Policy run `31143014039`：成功；
- Evidence：`docs/test-evidence/M10-14/manifest.json` 绑定最终实施提交及永久矩阵产物摘要。

## 非目标

- 不重写 Recovery 文件格式、三轨备份模型或恢复副本流程；
- 不修改产品功能范围、UI 信息架构、数据库 Schema 或已发布 Migration；
- 不以文件行数触发拆分；
- 不为通过测试扩大白名单、降低阈值或吞掉错误。

## 完成条件

- [x] 根因修复完成；
- [x] 回归测试覆盖成功、失败、取消、并发与跨午夜；
- [x] Coverage 排除收紧且永久门禁通过；
- [x] 全量差异复核无新增 P0/P1；
- [x] Ready Evidence 绑定最终实施提交；
- [ ] Controlled Merge、Main Verification 与任务验证完成；
- [ ] `work` 受控同步至最新 `main`。
