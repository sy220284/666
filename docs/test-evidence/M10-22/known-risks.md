# M10-22 已知风险与发行边界

- Stable 发行仍需要正式 Windows Authenticode 证书以及 macOS Developer ID / notarization / stapling 凭据。工程代码会在缺少这些凭据或验证失败时 fail-closed；本任务没有伪造生产证书结果。
- GitHub Hosted Runner 的性能与桌面测试仍受共享运行环境噪声影响；性能门禁保留一次自动 retry，预算本身没有放宽。
- Daily backup 以文件 lease 降低并发工作，并以 SQLite 写事务作为同项目同日期唯一 winner 的最终权威。loser 外部文件清理由事务后补偿完成；数据库权威不会因外部清理失败出现两个有效 Daily winner。
- 冻结 Schema 1 历史任务继续保留静态 Verified 兼容。所有新建及活动 Schema 2 任务必须依赖真实 `task-verification/<TASK-ID>`。
- PR #342 将服务器可见 `quality / quality` 与 Release Audit / package gate 收敛为同一最终 Quality 权威；Controlled Merge 仍额外验证最新 Workflow Run 新鲜度。任何来源 Ready 轮次失败都会被 Main Verification 再次拒绝。
