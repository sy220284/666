# M0-04 已知限制与剩余风险

- M0-04没有真实Provider或业务任务。后续适配器必须使用TaskProtocol控制器和AbortSignal；绕过该入口的自定义流不受“取消后无未来delta”保证保护。
- 任务快照、活动任务和取消幂等缓存当前属于Core进程生命周期。Core崩溃后的持久化GenerationRun、部分Candidate和恢复语义由M4-05/M5-04实现，当前不得把内存状态宣称为已保存。
- 页面切换可通过全局任务订阅和快照恢复；Core进程重启后旧MessagePort会断开，Renderer需重新订阅。后续工作台接入时必须实现该重连动作。
- 背压达到32条未ACK事件时会有意跳过中间流事件，并以sequence缺号触发快照恢复。预览最多保留2,000,000字符；超过上限会明确标记截断，不能猜测或静默拼接缺失内容。
- 项目任务会校验命令与任务的`projectId`一致，事件端口也按项目过滤；完整的activeProject与实体归属校验仍由项目工作空间和Repository任务接通。
- MessagePort端到端证据来自GitHub Ubuntu/Xvfb；Windows与macOS安装包、签名后运行和跨平台长时流式回归属于M8。
- 错误码与英文安全消息已冻结为机器契约；面向作者的中文文案和具体Renderer交互由后续UI任务映射，不能直接显示内部异常或堆栈。
