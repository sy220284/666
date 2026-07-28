# 已知风险

- Linux CI在Ubuntu 24.04/AppArmor环境使用显式且仅CI允许的无沙箱启动回退；生产Linux sandbox安装、桌面集成和卸载路径仍未验证。
- 尚无Windows代码签名、macOS签名/公证和三平台安装、升级、卸载证据，不得生成正式发布。
- AI Eval仅覆盖协议和确定性Fixture；真实Provider、真实Model、限流、成本与质量矩阵仍Blocked。
- 物理2K 125/150%、21:9、混合DPI、真实多屏、读屏、IME和自定义字体人工验收仍Blocked。
- 自动化通过不替代任务卡要求的人工P0路径；M8-02保持In Progress，当前发布结论为禁止发布。
