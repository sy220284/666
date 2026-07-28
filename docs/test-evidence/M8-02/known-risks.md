# 已知风险

- V1.0仅供仓库所有者本人使用，正式交付形态为Windows、macOS和Linux自用便携包。
- Windows代码签名、macOS签名/公证、系统安装器以及安装、升级、卸载生命周期已明确移出V1.0范围，状态为`NOT_REQUIRED_SELF_USE`，不再阻断M8-02。
- 未签名、未公证和无安装器必须如实披露；自用工件不得宣传或分发为适合第三方、企业部署或应用商店发布的正式产品。
- Windows或macOS可能显示安全警告，由仓库所有者本人确认并放行。
- Linux CI在Ubuntu 24.04/AppArmor环境允许显式CI-only无沙箱功能冒烟；该回退不得冒充通用Linux主机支持，实际自用启动方式仍需记录。
- AI Eval仍以协议和确定性Fixture为主；真实Provider、Model、限流、成本、权限和质量矩阵按实际资源验证，缺失时必须保持离线基础写作可用。
- 物理2K 125/150%、21:9、混合DPI、真实多屏、读屏、IME和自定义字体人工证据按可用设备记录，未执行项不得标记为通过。
- 性能JSON来自Linux GitHub-hosted runner，只作为回归基线；Renderer帧率、真实设备延迟、长期内存增长和Core事件循环阻塞仍需补充。
- 真实超大DOCX、ZIP中央目录与本地Header字段级交叉验证、Windows长路径及macOS/Linux文件系统差异仍未完成。
- 多进程或重复Core实例下日常备份持久化幂等仍未完成；当前只证明单Core实例内请求合并。
- M8-02保持`In Progress`，最终状态由仍适用的代码硬保证、数据安全、恢复、核心功能、三平台便携工件和Evidence决定。
