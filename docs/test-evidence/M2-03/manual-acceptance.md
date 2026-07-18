# M2-03 人工验收记录

| 验收点 | 当前结果 | 说明 |
| --- | --- | --- |
| Fixture Candidate只读Preview | 自动化PASS | 零写入快照对比通过；桌面场景已编写 |
| 20,000字符取消 | 自动化PASS / 桌面待运行 | Core取消与IPC边界通过；Electron场景等待DISPLAY |
| 无冲突Apply | 自动化PASS / 桌面待运行 | 单Revision、Checkpoint、ApplyRecord和Candidate状态原子提交；跨重启requestId返回首次结果 |
| Revision/Hash/Lock冲突 | 自动化PASS / 桌面待运行 | ConflictSet持久化，Draft不变 |
| 即时与重启后Undo | 自动化PASS / 桌面待运行 | 新Revision恢复，ApplyRecord持久化读取与Undo requestId重放通过 |
| Undo-stale与Checkpoint损坏 | 自动化PASS | 拒绝静默回退，Draft不变 |

本机人工桌面验收状态：`BLOCKED_BY_ENVIRONMENT`。原因：`E2E_DISPLAY_UNAVAILABLE`。不得把本文件解释为桌面验收已通过。
