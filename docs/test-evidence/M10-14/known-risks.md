# M10-14 已知风险与回退边界

## 剩余风险

1. **Daily Backup 多进程协调（Medium，接受）**  
   产品支持的 Electron 桌面运行态采用单实例约束；同进程 Daily Backup 已由 RecoveryService 唯一 lane 串行化。若用户绕过正式入口启动多个独立进程，跨进程仍依赖既有文件锁与备份幂等校验。该场景不扩展为新的多进程产品能力。

2. **Renderer DOM 生命周期覆盖（Medium，持续治理）**  
   React/DOM 生命周期仍采用双轨覆盖策略，但本次涉及的纯异步公共机制 `request-lifecycle.ts` 已移出 Coverage 排除并由直接行为测试覆盖。未降低 TS/TSX 既有门禁。

3. **外部 Provider 信任边界（Medium，接受）**  
   DNS Pinning、危险地址阻断和 HTTPS 外部端点约束继续成立；用户自行配置的外部模型如何保存请求仍属于既有剩余风险。

4. **Performance 单次 Runner 抖动（Low，已复核）**  
   中间验证曾出现一次事件循环 P99 `115.02ms` 超过 `100ms` 预算；未修改性能代码或阈值，后续完整永久 Performance 运行恢复通过，因此按 Runner 抖动记录，不豁免预算。

5. **Recovery 错误交付契约（Low，已锁定）**  
   清理与 Daily Backup 的前置失败保持 Promise rejection；Base Recovery Overview 的数据库可用性错误保持既有同步传播语义。对应回归测试已锁定，后续重构不得无意改变调用契约。

## 回退边界

- 不回退 Recovery 清理 fail-closed；
- 不恢复 `CheckpointAwareRecoveryService` 的平行 Daily Backup 状态机；
- 不恢复 Bridge 跨消费者取消污染或已放弃共享请求复用；
- 不放开 `FEC0::/10`；
- 不重新排除 `request-lifecycle.ts` 或降低 Coverage / Security / Performance / E2E 阈值；
- 不通过 Migration、依赖升级或产品规格变化掩盖本任务问题。
