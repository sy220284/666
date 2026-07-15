# M0-01 已知限制

- 提交`c3d8307`的GitHub Task Governance与Quality均已远程复验成功。
- Electron安全窗口与Core进程监管属于M0-02，本任务未创建可运行桌面窗口。
- `test:migration`、`test:security`、`test:e2e`、`test:perf`和`test:eval`已建立明确入口，但会返回“未就绪”及所属任务，避免空测试伪装通过。
- 当前各架构包只声明真实层级身份和职责，不包含未来领域表、生产Prompt或业务占位实现。
- Release工作流已经配置，但M8-03为`Planned`时发布门必然失败；真实Electron跨平台产物仍由M8-03接通。
