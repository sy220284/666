# M0-02 已知限制与剩余风险

- 当前执行容器没有DISPLAY或`xvfb-run`，因此本地真实窗口测试明确返回`E2E_DISPLAY_UNAVAILABLE`；同一Playwright用例已在GitHub Ubuntu镜像的Xvfb环境中通过，未把本地限制伪装成成功。
- Electron Fuses策略和应用工具已自动化测试，但只应对最终打包二进制执行；实际翻转、签名后验证和跨平台安装包回归属于M8发布任务。
- Linux没有可用OS密钥环且safeStorage回退为`basic_text`时，Credential Broker会拒绝保存凭据。该安全失败需要上层Provider设置界面提供明确用户指引。
- M0-02没有业务任务系统，因此Core drain当前确认待处理任务数为0；M0-04接入真实任务协议后必须复用该关闭握手并增加在途任务故障注入。
- 正式构建通过`app.isPackaged`关闭BrowserWindow DevTools；M8仍需验证没有额外远程调试启动参数并对最终二进制读取Fuses状态。
- 本任务未实现项目数据库、编辑器、任意业务IPC或真实Provider，凭据值不会被用于网络请求。
