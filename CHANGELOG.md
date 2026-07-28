# Changelog

本文件记录WorldForge面向用户的版本变化。正式版本遵循语义化版本；未合并或尚未满足发布门禁的内容保留在`Unreleased`。

## Unreleased

### Added

- 快速、完整、导入和空白四种首次入口，以及自主、混合、AI优先三条创作路径。
- 新手/专业披露模式、统一工作台、沉浸写作、状态仲裁和上下文帮助。
- Theme B水墨印章主题及Theme A/B的浅色、深色、护眼、高对比和减少动态支持。
- 安全诊断包预览、显式确认、本地原子导出和SHA-256。
- Windows、macOS、Linux原生Electron工件、ASAR完整性、生产Fuses和成品启动门禁。

### Changed

- 生产Renderer改由固定`worldforge-app://renderer/`安全协议提供，不再使用高权限`file://`应用页面。
- Performance永久门同时执行性能预算与AI输出协议基线。
- Linux便携包使用用户命名空间sandbox启动器；CI受AppArmor限制时仅允许显式CI-only功能冒烟回退。

### Security

- 诊断包严格排除项目正文、数据库、Prompt、Provider凭据和绝对路径。
- 生产构建关闭RunAsNode、Node环境参数、调试参数、额外文件协议权限和专用V8 snapshot开关；启用Cookie加密、ASAR完整性与OnlyLoadAppFromAsar。
- 自定义Renderer协议仅允许固定Host、ASAR内规范化根路径以及`html/js/css`资源。

### Known limitations

- 当前工件未签名、未公证，尚无Windows/macOS/Linux安装、升级和卸载闭环。
- Ubuntu 23.10+默认AppArmor环境仍需要正式安装流程配置生产sandbox；直接解压便携包不作为已支持发行路径。
- 真实Provider/Model质量矩阵、物理混合DPI与多屏、人工读屏和输入法验收尚未完成。
- 上述限制关闭前，V1.0发布状态为`禁止发布`。
