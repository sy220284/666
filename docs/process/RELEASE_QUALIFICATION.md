# WorldForge 发布资格判定规范

> 状态：Active
> 适用范围：V1.0 三平台 GitHub Release 手工发布。
> 更新日期：2026-08-20

## 1. 唯一发布权威

正式发布只由 `ReleaseAcceptance` 判定，权威输入为：

```text
当前 main 提交
├─ main-verification=success
├─ Release Quality / Security / Performance / UI Acceptance
├─ 三平台原生构建、启动冒烟与 package-manifest.json
└─ 三平台工件完整性
   ├─ 版本 / 架构 / 字节数 / SHA-256
   ├─ ASAR 与 Electron Fuses
   └─ 未签名状态与限制必须如实记录
```

`TASK_AUTHORIZATION.json`、`TASK_INDEX.md`、`docs/tasks/runtime/*.json` 和历史 `task-verification/*` 只用于项目管理与审计，不参与 Release 资格计算。

## 2. Source Authority

- 请求版本必须是严格 SemVer，且与 `package.json` 一致。
- Release 只能从 `main` 触发。
- 当前发布 SHA 必须拥有 `main-verification=success`。
- `release-acceptance.mjs` 只读取当前提交状态，不解析历史 Task Runtime。

## 3. Product Quality

每次 Release 必须执行完整 Quality、dependency audit、全历史 secret scan、应用安全测试、Performance、UI Acceptance、三平台核心端到端、三平台作者体验、Windows 原生中文输入法验收、三平台原生打包与启动冒烟。任一权威矩阵失败时，`publish` 不可运行。

## 4. Artifact Integrity

每个平台的 `package-manifest.json` 使用 Schema 2 并记录版本、平台、架构、工件名、字节数、SHA-256、ASAR/header Hash、Electron Fuses、`releaseKind`、`distributionTrustMode`、`signed`、`notarized`、`stapled` 与真实 `distributionTrustEvidence`。发布 Job 下载三平台工件后再次验证，并生成 `SHA256SUMS.txt`。

## 5. Distribution Trust

当前自用发布流程固定使用 `DISTRIBUTION_TRUST_MODE=allow-unsigned`。`draft`、`prerelease`、`stable` 均允许未签名；稳定版不再要求 Windows Authenticode，也不再要求 macOS Developer ID、Apple notarization 或 stapling。

发布工作流不得读取代码签名证书或 Apple 公证凭据，也不得把缺少这些凭据视为发布失败。manifest 必须如实记录 `signed: false`、`notarized: false`、`stapled: false`、`distributionTrustEvidence: null` 和未签名限制。

底层打包模块可保留显式 `required` 模式用于未来独立验证，但当前 GitHub Release 流程不会调用该模式。

## 6. Actions 凭据

当前发布流程不需要 Windows 代码签名证书、macOS Developer ID 证书或 Apple 公证 API Key。发布资格只依赖工程质量、当前主线权威状态、三平台真实测试与工件完整性。

## 7. 发布序列

```text
workflow_dispatch / 受控发布命令
→ Source Authority
→ Quality / Security / Performance / UI Acceptance
→ 三平台核心 E2E / 平台体验 / Windows IME
→ 三平台原生构建与 startup smoke
→ unsigned manifest 与工件 Hash 验证
→ 聚合复验三平台 manifest
→ SHA256SUMS
→ 创建不可覆盖的 GitHub Release
```

## 8. 维护规则

1. 新任务登记、状态变更或历史 Runtime 归档不得改变 Release 结果。
2. `allow-unsigned` 是当前自用发布固定策略；未来恢复签名必须由作者新的明确指令重新启用并同步工作流、单测和本规范。
3. manifest 不得伪造签名、公证或 stapling 状态。
4. 不得恢复旧 Task Runtime Release Gate 或新增第二套发布资格真源。
