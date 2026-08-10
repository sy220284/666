# M10-22 验证摘要

## 结论

M10-22 的工程实现与治理纠偏已在 PR #342 的冻结实现提交 `9ad7ce71cc64b0518c5f0830ed8d48c89f068468` 上完成完整验证。

本轮修复将服务器 Ruleset、Controlled Merge、Release Audit 和任务状态链收敛为同一事实模型：

- 服务器可见 `quality / quality` 是最终聚合门，同时依赖 Core Quality、Release Audit 与 package gate。
- Controlled Merge 在同一 Quality 事实之上校验当前 Head 最新 Quality / Security / Performance 运行，旧 Draft 成功结果不能替代 Ready 轮次。
- Ready Verified Evidence 扫描通过 `TASK_BASE_REF` 区分本 PR 的 Schema 2 `IMPLEMENTED` Runtime 与历史 Implemented 任务。
- 顶层 `quality.yml` 自身变化会触发真实 Linux、Windows、macOS package smoke。
- Schema 2 任务仍只能由合并后的 `task-verification/<TASK-ID>` 从 `IMPLEMENTED` 提升为有效 `VERIFIED`。

## 冻结实现验证

实现提交：`9ad7ce71cc64b0518c5f0830ed8d48c89f068468`

GitHub Actions：

- Quality run `31349008834`: success。
- Security run `31349008741`: success。
- Performance run `31349008664`: success。
- `quality / release-audit`: success；Verified Evidence Scan 与 changed Evidence validation 均成功。
- `quality / quality`: success，且在 Core Quality、Release Audit、package gate 完成后才发布最终结果。
- Unit、Integration、Migration、Coverage: success。
- Electron E2E: success。
- Linux、Windows、macOS package smoke: success。
- Toolchain export: success。

## #341 纠偏事实

#341 的工程实现提交曾通过完整矩阵，但其最新 Ready Quality 因当前 Runtime 被误判为历史任务而失败。该 PR 进入 main 后，Main Verification 正确将 `main-verification` 与 `task-verification/M10-22` 发布为 failure，因此不能作为 M10-22 的最终验证事实。

PR #342 从 #341 squash main 基线重新建立 `work`，修复最终 Quality 权威和当前 Runtime 识别，并重新执行完整验证。新的任务来源绑定为 PR #342。

## 最终状态语义

Runtime 静态声明保持 `IMPLEMENTED`。PR #342 合并后，只有 `main-verification=success` 且 `task-verification/M10-22=success` 时，统一 Effective Status 才计算为有效 `VERIFIED`。

Stable 正式发行仍独立要求真实 Windows Authenticode 与 macOS Developer ID / notarization / stapling 信任证据；缺少发行凭据时继续 fail-closed。
