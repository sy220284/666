# M10-03 已知风险

1. Handler Guard只能把异步/同步JavaScript异常转换为标准失败；若Electron、SQLite、磁盘或操作系统同步原生调用永久不返回，当前进程内Guard无法强制中断。该风险保持Info。
2. Provider幂等结果缓存超过1000项时仍线性寻找已完成条目淘汰；单作者桌面负载下影响可忽略，保持Info。
3. `RegisteredCommandSchema`为公开兼容导出，现阶段不能直接删除；新代码改用`CentralBridgeCommandSchema`，后续大版本才可评估移除旧名称。
4. 专项IPC在独立模块测试中没有安装生产Guard时仍直接注册到测试`IpcMain`；生产组合入口已按具体`IpcMain`实例强制安装Guard，WeakMap隔离多实例测试生命周期。
5. Preload公共运行时收敛不改变公开Bridge签名；完整Renderer/Electron回归必须由Ready矩阵确认。
