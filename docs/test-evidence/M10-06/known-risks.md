# M10-06 已知风险

1. 历史任务状态解析依赖受控 Squash 提交标题保留 `(#PR)`；无法唯一定位时安全阻断。
2. GitHub Commit Status API 不可用时，发布与全量 Evidence 扫描安全阻断。
3. 当前活动任务在合并前没有来源合并提交，不参与历史继承；合并后由 Main Verification 发布任务 Context。
