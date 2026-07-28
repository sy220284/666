# M8-02 验证记录

> 策略更新时间：2026-07-28  
> 策略基线提交：`258968683cb61940598078c3ba73951b1a1bbcb0`  
> 正式PR：[#224](https://github.com/sy220284/666/pull/224)  
> 交付范围：`SELF_USE_PORTABLE`

## 发布范围调整

V1.0仅供仓库所有者本人使用，交付形态为Windows、macOS和Linux自用便携包。代码签名、Apple公证、系统安装器以及安装、修复、升级、自动更新和卸载生命周期已移出M8-02完成条件，统一记录为`NOT_REQUIRED_SELF_USE`。

该调整只降低公开分发门槛，不降低以下硬要求：

- 三平台原生构建、ASAR完整性、Electron Fuses、SHA-256和启动验证。
- 新版本便携包能够打开既有项目并执行必要Migration。
- 程序目录与作者项目目录分离，替换或删除程序目录不删除作品、数据库和备份。
- 核心功能、数据安全、恢复、隐私和Electron边界必须真实通过。
- 未执行能力必须如实记录，不得伪造成功。

## 已完成代码闭环

- StatusArbiter复用Candidate、StateProposal、Validation、FTS和备份失败账本权威查询。
- `candidate.list`支持只传projectId跨章节读取全项目Candidate。
- “AI优先”仅在当前会话Provider连接测试成功后解锁。
- 诊断导出确认位于Main可信边界，拒绝确认时不打开目录、不写文件。
- Recovery备份失败账本已加入Migration、合同、Core查询、Renderer仲裁和测试。
- 2K写作/自动保存、5000字Diff和156万字符FTS结构化性能证据已生成。
- Windows、macOS和Linux原生便携构建、ASAR/Fuse/Hash与启动验证纳入自动化门禁。

## 自用便携验收口径

| 范围 | 必须验证 | 明确非目标 |
|---|---|---|
| Windows | 原生构建、完整性、启动、既有项目兼容 | 代码签名、SmartScreen信誉、MSI/MSIX、安装生命周期 |
| macOS | 原生构建、完整性、启动、既有项目兼容 | Developer ID签名、Apple公证、DMG/PKG安装器 |
| Linux | 原生构建、完整性、启动方式和既有项目兼容 | DEB/RPM、桌面集成、安装/卸载；CI-only回退不代表通用支持 |

`package-manifest.json`中的`signed: false`和`notarized: false`属于事实记录，不再构成自用交付失败。

## 尚未关闭

- 最新Head完整Quality、Security、Performance、Evidence及治理门禁需要重新跑绿。
- 真实Provider和多模型质量矩阵按实际账号与模型资源执行；缺失时必须验证离线写作降级。
- 物理混合DPI、多屏、人工读屏、IME和自定义字体按可用设备补充证据。
- 真实超大DOCX字段交叉验证、多进程备份幂等、长期运行、Renderer真实帧率和Core事件循环报告。
- Linux实际自用主机启动方式需记录；CI-only无沙箱回退不得冒充生产支持。

## 当前判断

M8-02继续保持`In Progress`和Draft PR。签名、公证及安装生命周期不再是Blocked项；最终能否转Ready和Verified，只取决于仍适用的P0代码硬保证、数据安全、恢复、核心功能、三平台自用便携工件和最终Evidence。
