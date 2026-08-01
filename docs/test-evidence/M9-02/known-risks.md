# 已知风险

- 本地容器没有DISPLAY或`xvfb-run`，因此本地Electron E2E明确返回`E2E_DISPLAY_UNAVAILABLE`；来源PR的Draft与Ready两轮GitHub Ubuntu Xvfb Electron E2E均成功，未把本地环境限制伪装成通过。
- `pnpm release:check`确认发布工具配置有效，但在M9-03—M9-14全部Verified前保持发布阻断，这是当前任务治理的预期状态。
- M9-03—M9-14尚未完成；M9-02只关闭Shared Structure工作包，不代表M9阶段完成。
