# M0-01 已知限制

- GitHub Actions结果必须在提交到`main`后复验；在远程门禁成功前，任务保持`In Progress`。
- Electron安全窗口与Core进程监管属于M0-02，本任务未创建可运行桌面窗口。
- `test:migration`、`test:security`、`test:e2e`、`test:perf`和`test:eval`已建立明确入口，但会返回“未就绪”及所属任务，避免空测试伪装通过。
- 当前各架构包只声明真实层级身份和职责，不包含未来领域表、生产Prompt或业务占位实现。
