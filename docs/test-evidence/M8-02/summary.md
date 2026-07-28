# M8-02 验证记录

> 策略更新时间：2026-07-28  
> 策略基线提交：以PR最新Head为准  
> 正式PR：[#224](https://github.com/sy220284/666/pull/224)  
> 交付范围：`SELF_USE_PORTABLE`  
> 验收来源：`GITHUB_ACTIONS_ONLY`

## 验收范围

V1.0仅供仓库所有者本人使用，交付形态为Windows、macOS和Linux自用便携包。M8-02最终验收以GitHub Actions环境中的永久门禁和专项工作流结果为准。

以下项目不属于完成条件：

- 线下物理DPI、混合DPI、真实多屏和跨屏移动。
- 实体读屏、人工IME、自定义字体、人工视觉复核和线下五分钟新手流程。
- Linux实体自用主机启动记录。
- 真实Provider账号和线下模型质量测试。
- 代码签名、Apple公证、系统安装器及安装、修复、升级、自动更新和卸载生命周期。

GitHub Actions无法真实复现的硬件或第三方环境差异仅作为已知限制，不阻断M8-02转Ready、Verified或自用Release。

## 已完成代码闭环

- StatusArbiter复用Candidate、StateProposal、Validation、FTS和备份失败账本权威查询。
- `candidate.list`支持只传projectId跨章节读取全项目Candidate。
- “AI优先”仅在当前会话Provider连接测试成功后解锁；无真实Provider时离线写作保持可用。
- 诊断导出确认位于Main可信边界，拒绝确认时不打开目录、不写文件。
- Recovery备份失败账本已加入Migration、合同、Core查询、Renderer仲裁和测试。
- 2K写作/自动保存、5000字Diff和156万字符FTS结构化性能证据已生成。
- Windows、macOS和Linux原生Electron链、便携构建、ASAR/Fuse/Hash、资产完整性与启动验证纳入自动化门禁。
- Windows关闭项目后立即重开的生命周期竞态已修复并通过Windows完整Electron E2E。

## Actions验收口径

| 范围 | 必须通过 | 非阻断项 |
|---|---|---|
| Windows | 原生Runner构建、Electron E2E、完整性、启动、既有项目兼容 | 线下设备、签名、SmartScreen信誉、MSI/MSIX、安装生命周期 |
| macOS | 原生Runner构建、Electron E2E、完整性、启动、既有项目兼容 | 线下设备、Developer ID签名、Apple公证、DMG/PKG安装器 |
| Linux | GitHub-hosted Runner构建、Electron E2E、完整性和启动链路 | 实体主机记录、DEB/RPM、桌面集成和安装/卸载 |
| AI | 协议Fixture、错误映射、离线降级和基础写作可用 | 真实账号、线下模型质量和第三方服务稳定性背书 |
| UI/显示 | 合成视口、缩放、键盘、焦点、语义、减少动态和输入边界 | 物理DPI、多屏、实体读屏、人工IME和人工视觉复核 |

## 尚未关闭

- 最新Head完整Quality、Security、Performance、Evidence及治理门禁全部成功。
- GitHub Actions内完成超大DOCX字段交叉验证。
- GitHub Actions内完成多进程或重复Core实例备份幂等验证。
- GitHub Actions内完成长期运行、Renderer帧率和Core事件循环自动化报告。
- 最终Evidence绑定实际受检Head及可达main提交。

## 当前判断

M8-02继续保持`In Progress`和Draft PR，直到上述Actions可执行项全部通过并完成Evidence收口。线下设备、人工设备测试、真实Provider账号、签名、公证和安装生命周期均不阻断。
