# WorldForge 自用发布策略

> 状态：Approved  
> 适用版本：V1.0  
> 生效日期：2026-07-28

## 1. 发布边界

WorldForge V1.0仅供仓库所有者本人使用，不面向公众、客户、团队或第三方分发。

V1.0交付形态为Windows、macOS和Linux自用便携包。用户自行下载、解压并启动，不提供商店分发、企业部署、系统安装器或自动更新承诺。

## 2. 必须满足

- V1.0最终验收以GitHub Actions环境中的永久门禁和专项工作流结果为准。
- 三个平台均能在对应GitHub-hosted原生Runner完成构建。
- 产物版本、架构、SHA-256、ASAR完整性和Electron Fuses可验证。
- 便携包能够启动并完成核心本地写作链路。
- 新版本便携包能够打开既有项目，Migration、备份和恢复边界保持有效。
- 程序目录与作者项目目录分离；替换或删除程序目录不得删除作品、数据库或备份。
- 合成视口、缩放矩阵、键盘与焦点、无障碍语义、输入边界、Electron E2E、协议Fixture和离线降级测试通过。
- 未完成的Actions可执行项必须如实记录，不得把未执行验证标记为通过。

## 3. 自用候选与正式稳定版边界

`draft`默认仍可生成未签名作者自用候选；`prerelease`可通过工作流输入明确选择是否要求发行信任。`stable`即使仍由仓库所有者使用，也必须通过Windows Authenticode和macOS Developer ID签名、公证、stapling门禁。GitHub Release的“stable”标签不再允许表达未签名内部候选。

未签名工件只能保留为draft或显式允许的prerelease，manifest必须如实记录`allow-unsigned`、`signed: false`和`notarized: false`，不得宣传为可信分发包。

## 4. 明确非目标

以下事项不属于V1.0自用发布完成条件，不得作为M8-02转Ready、Verified或生成自用Release的阻断项：

- 物理DPI、混合DPI、真实多屏、跨屏移动及其他线下显示设备测试。
- 实体屏幕阅读器、人工IME、自定义字体、人工视觉复核和线下五分钟新手流程。
- Linux实体自用主机启动记录。
- 真实Provider账号、线下模型质量测试和第三方环境稳定性背书。
- Windows SmartScreen历史信誉积累；代码签名本身是stable门禁。
- Mac App Store上架；Developer ID签名与Apple公证本身是stable门禁。
- MSI、MSIX、PKG、DMG安装器或Linux DEB/RPM安装包。
- 安装、修复、覆盖升级、自动更新和卸载生命周期矩阵。
- 面向第三方的可信发布、企业部署或应用商店上架。

`package-manifest.json`中的`signed: false`与`notarized: false`只允许出现在未要求发行信任的候选包；stable出现该状态必须失败。

## 5. 使用限制

- 未签名draft/prerelease可能显示系统警告，由仓库所有者本人确认并放行。
- stable的签名、公证可建立发行身份，但不承诺立即获得Windows SmartScreen信誉。
- Linux GitHub Actions中使用的CI专用回退只证明自动化环境下功能链路通过，不代表所有Linux主机配置均已覆盖。
- GitHub Actions无法真实复现的硬件、系统策略或第三方服务差异作为已知限制记录，不阻断V1.0自用交付。
- 自用工件不得宣传为已签名、已公证、可公开分发或具备安装器生命周期保证。

## 6. 未来范围变化

若后续决定面向第三方公开推广，仍须另行立项安装器、升级卸载、渠道安全、隐私与真实用户环境验收；现有stable签名门只证明工件身份与Apple公证，不等于完成公开商业分发验收。
