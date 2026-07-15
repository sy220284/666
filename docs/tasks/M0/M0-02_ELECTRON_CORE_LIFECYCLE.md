# M0-02 Electron安全壳与Core生命周期

> 状态：In Progress  
> 里程碑：M0 工程、安全与运行底座  
> 优先级：P0  
> 工作分支：`main`（作者预授权连续主线模式）

## 目标

建立可安全启动、监管和关闭的桌面应用壳，冻结Main、Preload、Renderer、Core Utility Process和OS能力边界。

## 阶段定位

应用可安全启动、Core可监管、SQLite/IPC/测试底座可用，关键技术风险有量化结论。

## 非目标

- 不实现业务IPC命令。
- 不实现项目数据库和编辑器。
- 不接入真实Provider。

## 依赖

M0-01

## 关联

- 需求：REQ-001、REQ-024、REQ-042
- 功能ID：APP-001、AI-001
- 验收：P0-002—P0-005、P0-067—P0-069

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `SECURITY.md`
- `docs/security/THREAT_MODEL.md`
- `docs/security/PRIVACY_AND_LOGGING.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/contracts/IPC_CONTRACTS.md`

## 主要影响范围

- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `packages/contracts/`
- `packages/core-service/`
- `tests/security/`
- `tests/e2e/`

## 实施内容

1. 创建安全BrowserWindow：nodeIntegration=false、contextIsolation=true、sandbox=true、webSecurity=true。
2. 建立严格CSP、远程导航/新窗口/不受控下载拦截和系统浏览器外链。
3. Preload只暴露具名最小API，不暴露原始ipcRenderer、Node、文件系统、环境变量或数据库。
4. Main启动Core Utility Process，完成健康握手、异常退出报告、受控重启和关闭顺序。
5. 应用关闭时先停止新任务、请求Core排空、关闭窗口和进程，不以强杀掩盖未保存状态。
6. 建立OS Credential Store最小Broker接口，数据库和Renderer只接触credentialRef。
7. 建立本地结构化日志和诊断ID，默认不记录正文、密钥、完整路径和模型原始响应。
8. 评估并测试Electron Fuses与正式构建DevTools策略。

## 测试与证据

- Renderer访问require、process、fs、环境变量和数据库均失败。
- 远程页面不能在应用窗口加载，外链只进入系统浏览器。
- Core正常启动、崩溃、重启、超时和关闭均有可诊断结果。
- 凭据、正文和完整路径不进入Renderer、普通日志和错误响应。
- Electron安全配置和Fuses有自动化或人工证据。

证据保存到：`docs/test-evidence/M0-02/`

## 完成条件

- 安全窗口与Core生命周期真实接通。
- Core异常不会让Renderer获得越权能力，也不会伪造应用正常状态。
- 任一高风险安全用例失败时任务不得关闭。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
