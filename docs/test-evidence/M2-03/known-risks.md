# 已知风险

- 当前Linux容器没有`DISPLAY`或`xvfb-run`，新增的Preview取消、Apply、Conflict、重启后Undo Electron场景尚待有显示环境的CI执行。
- `ci:evidence`需要PR环境提供`EVIDENCE_BASE_SHA`；本地8项证据清单已逐项通过SHA-256校验，差异策略校验等待implementation PR。
- M5-05负责完整候选工作台、响应式布局、同步滚动、快捷键和完整无障碍验收；M2-03仅交付最小桌面安全闭环。
- M1-08审计中的“物理损坏项目库无法从应用内浏览恢复副本”仍是既有恢复入口风险，不在M2-03授权范围内静默改造。
- 任务卡规定PR合并main后才能标记Implemented/Verified；当前工作树保持In Progress。
