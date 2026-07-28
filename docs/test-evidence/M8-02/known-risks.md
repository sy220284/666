# 已知风险

- Linux CI在Ubuntu 24.04/AppArmor环境使用显式且仅CI允许的无沙箱启动回退；生产Linux sandbox安装、桌面集成和卸载路径仍未验证。
- 尚无Windows代码签名、macOS签名/公证和三平台安装、升级、卸载证据，不得生成正式发布。
- AI Eval仍以协议和确定性Fixture为主；真实Provider、真实Model、限流、成本、权限和质量矩阵Blocked。当前“AI优先”只信任本次会话实际连接测试，应用重启后必须重新验证。
- 物理2K 125/150%、21:9、混合DPI、真实多屏、读屏、IME和自定义字体人工验收仍Blocked。
- 性能JSON来自Linux GitHub-hosted runner，只能作为回归基线；Renderer帧率、真实设备延迟、长期内存增长和Core事件循环阻塞尚未形成发布报告。
- Candidate全项目待审汇总已通过扩展既有`candidate.list`合同关闭；后续必须保持projectId隔离和章节筛选兼容，不得再建第二套查询。
- Recovery现有Overview不提供失败备份账本，StatusArbiter无法可靠展示历史备份失败；不得用“无失败记录”代替成功。
- 真实超大DOCX、ZIP中央目录与本地Header字段级交叉验证、Windows长路径及macOS/Linux文件系统差异仍未完成。
- 多进程或重复Core实例下日常备份持久化幂等仍未完成；当前只证明单Core实例内请求合并。
- 自动化通过不替代人工P0路径；M8-02保持In Progress，当前发布结论为禁止发布。
