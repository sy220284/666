# M2-04 人工验收记录

1. 在真实Electron进程中拆分章节并确认结构与Draft写入保持原子性。
2. 为待删除章节创建 `timeline_events.chapter_id` 锚点。
3. 移入废纸篓后尝试永久删除，界面明确显示 `timeline_events.chapter_id`、引用数量和 `SET NULL`，删除被阻断。
4. 解除锚点后再次永久删除，Core在事务内重算影响与planHash，创建已验证恢复点并完成删除。
5. 确认废纸篓显示空态，章节、TrashEntry和受控Draft数据按计划删除。

结论：全部验收项通过。三张截图与完整Electron日志来自同一成功Quality运行。
