# M0-02 Electron安全基线

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m0-electron-security`

## 目标

冻结Main、Preload、Renderer和OS能力之间的安全边界，使后续业务功能只能通过受控契约访问Core。

## 非目标

- 不实现业务数据库。
- 不实现真实项目功能。
- 不接入真实AI Provider。

## 依赖

M0-01。

## 关联

- 需求：REQ-001、REQ-024、REQ-042
- 验收：P0-002—P0-005、P0-067—P0-069

## 必读文档

- `SECURITY.md`
- `docs/security/THREAT_MODEL.md`
- `docs/security/PRIVACY_AND_LOGGING.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/testing/SECURITY_TEST_CASES.md`

## 实施内容

1. Electron窗口固定：
   - `nodeIntegration: false`
   - `contextIsolation: true`
   - `sandbox: true`
   - `webSecurity: true`
2. 建立严格CSP。
3. Preload只暴露具名白名单方法。
4. 禁止Renderer获取`require`、`process`、文件、数据库和环境变量。
5. 阻止应用内远程导航、新窗口和不受控下载。
6. 外链交系统浏览器打开。
7. 冻结正式构建DevTools策略。
8. 完成OS Credential Store最小Spike，数据库只保存`credentialRef`。
9. 建立安全日志字段白名单。
10. 评估并测试Electron Fuses。

## 测试

- Renderer访问Node与文件失败。
- 未注册IPC与额外字段被拒绝。
- 外部页面不在应用窗口中加载。
- 凭据不进入Renderer、数据库和普通日志。
- Core异常退出可以安全报告。

## 完成条件

P0-002—005、P0-067—069全部具备自动化或手动证据；任一高风险安全用例失败时不得关闭任务。
