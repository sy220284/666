# M1-07 实施证据摘要

- Version与VersionBlock由单事务从指定Draft Revision创建。
- Version列表和正文预览为只读；Core无历史版本UPDATE/DELETE业务入口。
- 版本标签、说明、定稿指针和重启后一致性由Integration/E2E覆盖。
- 恢复操作归档旧Draft并创建新活动Draft，恢复后可继续编辑。
- 无效恢复不会改变当前活动Draft，历史Version正文与Hash保持不变。

自动化门禁结果以本次主线提交对应的GitHub Actions记录为准；人工截图和最终Verified状态按M1批量验收策略统一补录。
