# M0 里程碑：工程、安全与关键技术验证

> 状态：Approved summary  
> 一任务一文件为唯一执行依据，本文件只保留里程碑目标和索引。

## 目标

建立可构建、可测试、安全隔离的数据与运行底座，并通过显示、AI和中文Diff Spike消除高风险不确定性。

## 任务

1. [`M0-01 Monorepo与质量工具`](M0/M0-01_MONOREPO_FOUNDATION.md)
2. [`M0-02 Electron安全基线`](M0/M0-02_ELECTRON_SECURITY.md)
3. [`M0-03 SQLite、Migration与单写队列`](M0/M0-03_SQLITE_WRITE_QUEUE.md)
4. [`M0-04 IPC与流式事件协议`](M0/M0-04_IPC_STREAMING.md)
5. [`M0-05 2K、曲面屏与窗口恢复Spike`](M0/M0-05_DISPLAY_SCALING_SPIKE.md)
6. [`M0-06 AI质量与中文Diff Spike`](M0/M0-06_AI_DIFF_SPIKE.md)

## 退出条件

- Monorepo质量命令全部通过。
- Electron安全边界有测试证据。
- SQLite写队列、Migration和完整性检查可用。
- IPC流式事件、背压、取消和恢复可用。
- 目标显示环境完成Spike。
- T0/T1协议和中文Diff形成继续/降级决策。

开始任何任务前必须由作者在`ACTIVE_TASK.md`中激活对应任务。
