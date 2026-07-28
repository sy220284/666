# 已知限制

- V1.0仅供仓库所有者本人使用，正式交付形态为Windows、macOS和Linux自用便携包。
- M8-02最终验收以GitHub Actions环境中的永久门禁与专项工作流为准。
- 物理DPI、混合DPI、真实多屏、实体读屏、人工IME、自定义字体、人工视觉复核、线下新手流程和Linux实体主机测试不属于V1.0完成条件。
- 真实Provider账号与线下模型质量测试不属于完成条件；AI协议Fixture、错误映射、离线降级和无AI基础写作必须在Actions中通过。
- Windows代码签名、macOS签名/公证、系统安装器以及安装、升级、卸载生命周期为`NOT_REQUIRED_SELF_USE`。
- 未签名、未公证和无安装器必须如实披露；自用工件不得宣传或分发为适合第三方、企业部署或应用商店发布的正式产品。
- GitHub Actions无法真实复现的硬件、系统策略和第三方服务差异作为已知限制记录，不阻断M8-02关闭。
- Linux CI专用无沙箱回退只证明CI功能链路，不代表所有Linux主机配置均已覆盖。
- 性能JSON来自GitHub-hosted runner，作为V1.0自动化验收与回归基线。
- 超大DOCX字段交叉验证、多进程备份幂等、长期运行、Renderer帧率和Core事件循环仍须由GitHub Actions补齐。
- M8-02保持`In Progress`，最终状态只由Actions永久门禁、P0代码硬保证、数据安全、恢复、核心功能、三平台便携工件和Evidence决定。
