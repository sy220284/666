# M1-08 验证摘要

状态：Verified。来源提交：`9da54fb67cdf43d1b4bc4b77e7af5770a6522ac5`。

物理损坏的 `project.sqlite` 无法作为Reader打开时，恢复服务只从通过路径、普通文件、SHA-256、SQLite完整性、外键与项目身份校验的外部Checkpoint读取Version目录与正文。真实Electron链路已验证：损坏前创建Version与Checkpoint；损坏后仍可浏览Version、导出正文并恢复新项目副本；损坏源库和Checkpoint保持不变。

Quality运行：`29788218764`；桌面工件：`8479349358`；19/19 Electron测试通过。
