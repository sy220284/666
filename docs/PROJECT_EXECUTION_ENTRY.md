# WorldForge 项目执行统一入口

> 状态：VERIFIED_HOLD
> 面向：Codex、开发者、审查者、测试人员

## 1. 启动顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/ACTIVE_TASK.json（终态兼容锚点）
→ docs/tasks/TASK_INDEX.md
→ 新任务Runtime与独立任务卡
→ 任务卡列出的专项真源、现有代码、测试、Migration、IPC与Evidence
```

`TASK_AUTHORIZATION.json`定义任务PR与main串行写入规则；`docs/tasks/runtime/`保存任务机器状态和历史验证记录。M9、M10-01及M10-02均已完成Verified闭环，当前没有活动开发任务。

## 2. 当前基线

```text
M8-09 V1.0稳定性治理（Verified）
→ M9-00 治理激活与权威文档同步（Verified）
→ M9-01 / AR-01 重构安全网（Verified）
→ M9-02 / AR-02 Shared Structure（Verified）
→ M9-03 / AR-03—AR-14 统一架构拆分（Verified）
   ├─ Writing、Canon、Planning与AppShell拆分
   ├─ Contracts、Preload与Main IPC拆分
   ├─ ServiceFacade、Project Workspace、Recovery与工具域拆分
   └─ Legacy退役、CSS分层与结构预算收敛
→ M10-01 异步生命周期与竞态硬化（Verified）
   ├─ 连续切章与编辑器可编辑状态修复
   ├─ Task缺口恢复重复Snapshot收敛
   ├─ 覆盖率与异步交错测试补强
   └─ pnpm 11.13.1与性能测试隔离
→ M10-02 全量代码测试与深度审计（Verified）
   ├─ Renderer、Preload、Main IPC与Core全域审计
   ├─ 设定提取轮询单飞与卸载保护
   ├─ DOM安全边界、纯函数与轮询基线补测
   └─ 同一Head完整质量矩阵与三平台包体复核
```

M10-02来源PR #297已Squash合并至产品代码基线`main@ca83d48c7493bba21252a37f9aec024d6aa0ca79`；Main Verification运行`30788229139`成功。最终Head的Quality、Security、Performance、Evidence、Task Governance和PR Policy永久门禁全部成功，Linux、Windows、macOS三平台Package Smoke通过。

当前覆盖率：Statements 85.35%、Branches 75.61%、Functions 85.81%、Lines 87.49%；246个测试文件、1063项测试通过。Electron E2E 33/33通过；覆盖门槛、性能预算和覆盖排除清单均未放宽。

## 3. 当前执行模式

```text
仓库状态：VERIFIED_HOLD
基线分支：main
产品代码基线：ca83d48c7493bba21252a37f9aec024d6aa0ca79
main写入：serialized
直接main提交：禁止
活动任务：0
活动分支：无
活动PR：无
```

后续开发必须重新立项，创建独立任务卡、Runtime、工作分支和PR绑定；不得沿用M9-03、M10-01或M10-02的已关闭Runtime继续开发。

## 4. 权威顺序

```text
作者最新明确指令
> TASK_AUTHORIZATION、任务Runtime与TASK_INDEX
> 当前独立任务卡
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> 冻结专项规格、ADR、Schema、契约、UI、安全与P0验收
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> 现有实现
```

发现冲突时必须记录冲突来源、数据兼容、影响范围和解决方案，禁止静默选择。

## 5. 已验证治理边界

- M9保持行为完成架构拆分；M10-01处理已核实的异步竞态与工具链问题；M10-02完成全量自动验证和源码深度审计。
- 历史Migration、数据库Schema、IPC Channel字符串、`PROTOCOL_VERSION`、正式错误码和公开Bridge方法均保持不变。
- AI输出继续先进入建议稿，设定更新建议继续由作者裁决，`project.sqlite`继续是作品唯一权威真源。
- Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。
- 设定提取进度轮询使用单飞调度，慢IPC不会产生同键重叠请求；卸载后不再调度或回写。
- Legacy入口与旧CSS责任域已完成退役和收敛，结构预算保持0项债务。
- pnpm执行版本统一为11.13.1；性能预算未放宽，仅隔离测试文件间资源竞争。

M9历史入口：[`docs/tasks/M9/README.md`](tasks/M9/README.md)。  
M10-01任务卡：[`docs/tasks/M10/M10-01_ASYNC_LIFECYCLE_HARDENING.md`](tasks/M10/M10-01_ASYNC_LIFECYCLE_HARDENING.md)。  
M10-02任务卡：[`docs/tasks/M10/M10-02_FULL_CODE_AUDIT.md`](tasks/M10/M10-02_FULL_CODE_AUDIT.md)。

## 6. 后续任务标准闭环

```text
重新立项并冻结范围
→ 创建任务卡、Runtime与统一工作分支PR绑定
→ 核对依赖、允许路径、行为不变量和结构预算
→ 建立行为测试或稳定复现
→ 实施并完成专项回归
→ 执行完整质量矩阵
→ 更新任务卡、Runtime与Evidence
→ Draft转Ready
→ 永久门禁全部成功
→ 使用expected_head_sha受控合并
→ 等待main-verification成功
→ 独立治理关闭为Verified或进入下一任务
```

## 7. GitHub Actions工具链

主线工作流是本项目安装与验证工具版本的权威来源：

```text
Runner：Ubuntu 24.04 / Windows latest / macOS latest
Node：24
pnpm：11.13.1
依赖安装：pnpm install --frozen-lockfile --prefer-offline
Linux Electron显示依赖：fonts-noto-cjk、xvfb
Windows中文输入：系统内置Microsoft Pinyin
```

本地环境缺少同版工具或无法联网安装时，不得用其他版本冒充最终结论；应从GitHub Actions工作流或产物获取同版工具与诊断，再根据精确结果收口。

## 8. 强制规则

- 不修改已Verified任务卡、历史Migration和历史Evidence Manifest。
- 不建立第二套Prompt、任务协议、建议稿采用、导入、恢复、模式、主题或搜索数据真源。
- 未接通能力不得显示可用，不得写入半成品权威数据。
- 无AI写作、保存、历史版本、导出和恢复始终必须可用。
- 测试、构建、发布和平台结论必须来自真实运行。
- PR Head检查成功不等于main验证成功；合并后必须复核最终main SHA及`main-verification`。
- 当前无授权开发任务；任何新增改动必须先建立独立任务Runtime。
