# M10-03 已知风险

1. Handler Guard只能把同步或异步JavaScript异常转换为标准失败；若Electron、SQLite、磁盘或操作系统同步原生调用永久不返回，当前进程内Guard无法强制中断。该风险保持Info。
2. Provider幂等结果缓存超过1000项时仍线性寻找已完成条目淘汰；单作者桌面负载下影响可忽略，保持Info。
3. `RegisteredCommandSchema`名称继续保留以维持公开契约表面；源码注释已明确其只覆盖中央主桥，专项命令由独立严格Schema负责。
4. 专项IPC在独立模块测试中未安装生产Guard时仍直接注册到测试`IpcMain`；生产组合入口已按具体`IpcMain`实例强制安装Guard，WeakMap隔离多实例测试生命周期。
5. Preload公共运行时收敛不改变公开Bridge签名；最终Renderer和Electron行为由Ready矩阵验证。
6. 三平台Package Smoke与Windows微软拼音由永久路径策略按变更范围路由；若最终Head被策略跳过，只能记录为不适用，不能记录为真实执行成功。
