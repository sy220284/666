# M12-02 已知风险

1. Research Attachment 当前只对允许类型提供受控文本预览；PDF/DOCX/HTML 等任意附件正文解析仍属于非目标，禁止因此绕过解析白名单与资源上限。
2. Research 仅是作者参考资料。后续能力不得把 Research 自动提升为 Canon / Continuity / Planning，也不得默认把整个资料库塞入 ConstraintPackage。
3. 受管附件已进入 Project Artifact Set；后续 Migration、Backup、Restore、Move、Clone 必须继续识别既有 artifact manifest/version，不能让附件退化为孤儿文件。
4. SearchTools/FTS 是 Research 搜索的唯一权威；不得在 Renderer 或 Research 域新增第二套全文索引。
5. Windows 历史验证曾在已完成产品场景后的 Electron teardown 出现一次 Playwright close 竞态；最终实现提交的 Windows 平台作者体验与原生拼音均成功，未观察到产品回归。该 runner teardown 敏感性继续由永久 Windows 门禁监控。
6. 视觉回归必须先规范化焦点、滚动与指针状态，并要求连续两张截图字节一致；主题/UI 合法变化仍需至少两份独立 Actions 见证后才能更新 baseline，禁止把路由恢复或合成中的中间帧固化为基线。
7. `IMPLEMENTED` 是合并前静态状态；最终有效 `VERIFIED` 仍需 Controlled Merge、`main-verification` 与 `task-verification/M12-02` 成功。
