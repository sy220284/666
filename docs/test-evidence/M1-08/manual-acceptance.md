# M1-08 人工验收记录

1. 在真实Electron进程中创建项目、正文Version和已验证Checkpoint。
2. 关闭项目并破坏 `project.sqlite` 文件头，使原数据库进入物理不可读状态。
3. 通过“恢复损坏项目”入口打开恢复模式，界面列出Checkpoint中的Version。
4. 导出所选Version，核对正文内容来自已验证Checkpoint。
5. 恢复到新项目副本，核对新副本可打开，原损坏文件未被覆盖。

结论：全部验收项通过。截图与完整Electron日志均来自同一成功Quality运行。
