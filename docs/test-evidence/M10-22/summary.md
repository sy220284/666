# M10-22 验证摘要

## 结论

M10-22 的最终工程实现已冻结在 PR #342 提交 `e1d75ac55985454eddf690932546bedb9cd92b89`，并完成完整 Draft 验证。

本轮最终收口统一了四类权威事实：

- 服务器可见 `quality / quality` 是最终聚合门，依赖 Core Quality、Release Audit 与 package gate。
- Controlled Merge 在同一 Quality 事实之上核对当前 Head 最新 Quality / Security / Performance Workflow Run，旧 Draft 成功结果不能替代 Ready 轮次。
- Ready Verified Evidence Scan 通过 `TASK_BASE_REF` 区分当前 Schema 2 Runtime 与历史 Implemented Runtime。
- Daily Backup file lease 将同一 owner 的 heartbeat、`assertOwner`、`release` 串行化；heartbeat 使用 single-flight，并通过 `heartbeatPending` 保留慢 I/O 期间产生的续租需求，避免 owner 自竞争和续租 tick 丢失。

## 冻结实现验证

实现提交：`e1d75ac55985454eddf690932546bedb9cd92b89`

GitHub Actions：

- Quality run `31351259907`: success。
- Security run `31351259803`: success。
- Performance run `31351259799`: success。
- `quality / release-audit`: success；Verified Evidence Scan 与 changed Evidence validation 均成功。
- 静态检查：Workspace、边界、Format、Lint、TypeScript 全部成功。
- Unit、Integration、Migration、Coverage 全部成功。
- Recovery Integration 同时通过 live-owner heartbeat、expired-owner fencing、legacy stale reclaim、并发 stale reclaim 与 SQLite Daily winner 回归。
- Electron E2E：33/33 success，运行 14.3 分钟，并上传 `desktop-e2e-evidence` Artifact。
- Linux、Windows、macOS package smoke 全部成功。
- Toolchain export 成功。
- 最终 `quality / quality` 在 Core Quality、Release Audit 与 package gate 全部完成后成功。

## #341 / #342 纠偏链

#341 的工程实现曾通过完整矩阵，但其最新 Ready Quality 因当前 Runtime 被误判为历史任务而失败。#341 进入 main 后，Main Verification 正确发布失败状态，因此该来源不能形成 M10-22 的有效 Verified 事实。

PR #342 从 #341 squash main 基线重新建立 `work`，修复最终 Quality 权威、Ready Evidence 当前 Runtime 识别、顶层 Quality package 路由以及 Ready 轮次暴露的 file lease heartbeat 竞态，并重新完成完整验证。

## 最终状态语义

Runtime Schema 2 静态状态继续使用 `IMPLEMENTED`。PR #342 合并后，只有 `main-verification=success` 与 `task-verification/M10-22=success` 同时成立，统一 Effective Status 才计算为有效 `VERIFIED`。

Stable 正式发行仍独立要求真实 Windows Authenticode 与 macOS Developer ID / notarization / stapling 信任证据；缺少发行凭据时继续 fail-closed。
