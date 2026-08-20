# WorldForge 自用发布策略

> 状态：Approved
> 适用版本：V1.0
> 生效日期：2026-08-20

## 1. 发布边界

WorldForge V1.0 仅供仓库所有者本人使用，不面向公众、客户、团队或第三方分发。交付形态为 Windows、macOS 和 Linux 自用便携包，不提供商店分发、企业部署、系统安装器或自动更新承诺。

## 2. 必须满足

- 最终验收以 GitHub Actions 永久门禁和正式 Release 专项工作流结果为准。
- 三个平台均在对应 GitHub-hosted 原生 Runner 完成构建。
- 产物版本、架构、SHA-256、ASAR 完整性和 Electron Fuses 可验证。
- 三平台核心写作链路、平台体验、启动冒烟通过，Windows 原生中文输入法验收通过。
- 新版本便携包能够打开既有项目，Migration、备份和恢复边界保持有效。
- 程序目录与作者项目目录分离；替换或删除程序目录不得删除作品、数据库或备份。
- 未完成的 Actions 可执行项必须如实记录，不得把未执行验证标记为通过。

## 3. 自用候选与正式稳定版边界

`draft`、`prerelease`、`stable` 当前统一允许未签名。稳定版表示已经通过全部工程、产品、三平台端到端和工件完整性门禁，不再包含代码签名或 Apple 公证要求。

发布工作流固定使用 `allow-unsigned`。Windows 和 macOS 工件可以在 `stable` 中记录 `signed: false`；macOS 同时允许 `notarized: false`、`stapled: false`。这些字段必须真实，不得宣传为已签名或已公证。

## 4. 明确非目标

- Windows Authenticode 代码签名和 SmartScreen 信誉积累。
- macOS Developer ID 签名、Apple notarization、stapling 和 Mac App Store 上架。
- MSI、MSIX、PKG、DMG 安装器或 Linux DEB/RPM 安装包。
- 安装、修复、覆盖升级、自动更新和卸载生命周期矩阵。
- 面向第三方的可信发布、企业部署或应用商店上架。

## 5. 使用限制

- Windows/macOS 未签名稳定包可能显示系统安全警告，需要仓库所有者本人确认并放行。
- `package-manifest.json` 和 Release 说明不得把未签名包描述为具有发行身份背书。
- 自用工件不得宣传为已签名、已公证、可公开分发或具备安装器生命周期保证。

## 6. 未来范围变化

若后续决定面向第三方公开推广，应另行恢复并设计代码签名、公证、安装器、升级卸载、渠道安全、隐私与真实用户环境验收；这些能力不属于当前自用稳定版发布门禁。
