# WorldForge 项目执行统一入口

> 状态：M9 V1.1 架构治理 VERIFIED_HOLD
> 面向：Codex、开发者、审查者、测试人员

## 1. 启动顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/ACTIVE_TASK.json（V1.0/V1.1终态兼容锚点）
→ docs/tasks/TASK_INDEX.md
→ 新任务Runtime与独立任务卡（仅在重新立项后存在）
→ 任务卡列出的专项真源、现有代码、测试、Migration、IPC与Evidence
```

`TASK_AUTHORIZATION.json`定义任务PR与main串行写入规则；`docs/tasks/runtime/`保存任务机器状态和历史验证记录。当前没有活动M9任务，`ACTIVE_TASK.json`保存M8-09兼容锚点及M9-03最终验证保持状态。

## 2. 当前基线

M8-09已经完成V1.0稳定性与生命周期治理。M9在保持产品行为、持久化格式、IPC协议、错误码和发布边界的前提下完成V1.1架构拆分：

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
```

M9-03实施PR #273已合并至`main@f5add56154e99bc907376e08787b7037851835f0`；Main Verification运行`30754708770`成功。验证PR #289完成Windows原生微软拼音及Linux、Windows、macOS三平台Package Smoke。治理PR #292将M9-03关闭为Verified，最终关闭提交为`b72c591e6925f8f2ef92a3854fca857d05a3f103`。

最终结构扫描结果：397个源码文件、1171条相对导入边、0项结构债务。

## 3. 当前执行模式

```text
仓库状态：VERIFIED_HOLD
基线分支：main
main写入：serialized
直接main提交：禁止
活动任务：无
新任务入口：重新立项并创建独立任务卡与Runtime
PR绑定：<!-- worldforge-task: Mx-yy -->
```

M9-00—M9-03全部Verified，M9-04—M9-14继续保持`Removed（absorbed by M9-03）`。任何新功能、公开分发能力、行为修改或架构续作都必须重新立项，建立新的任务授权、Runtime、任务卡、验证矩阵和回退边界后再实施。

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

## 5. M9最终治理边界

- M9只实施保持行为的架构拆分，没有新增产品功能。
- 历史Migration、数据库Schema、IPC Channel字符串、`PROTOCOL_VERSION`、正式错误码和公开Bridge方法均保持不变。
- AI输出继续先进入建议稿，设定更新建议继续由作者裁决，`project.sqlite`继续是作品唯一权威真源。
- Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。
- M9-03已统一承接并完成AR-03—AR-14；M9-04—M9-14不恢复独立Runtime或独立任务状态。
- AR-04、AR-10、AR-12和AR-13的独立回退说明、专项验证及最终Evidence已保存。
- Legacy入口与旧CSS责任域已完成退役和收敛，结构预算当前为0项债务。

M9方案与历史证据入口：[`docs/tasks/M9/README.md`](tasks/M9/README.md)。

## 6. 后续任务标准闭环

```text
重新立项并冻结范围
→ 创建任务卡、Runtime、分支与PR绑定
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

不得在`VERIFIED_HOLD`状态下沿用M9-03 Runtime继续开发，也不得将M9-04—M9-14恢复成独立活动任务。

## 7. GitHub Actions工具链

主线工作流是本项目安装与验证工具版本的权威来源：

```text
Runner：Ubuntu 24.04 / Windows latest / macOS latest
Node：24
pnpm：11.13.0
依赖安装：pnpm install --frozen-lockfile --prefer-offline
Linux Electron显示依赖：fonts-noto-cjk、xvfb
Windows中文输入：系统内置Microsoft Pinyin
```

本地环境缺少同版工具或无法联网安装时，不得用其他版本冒充最终结论；允许先实施并由Draft PR Actions取得格式、类型、测试、构建和E2E的正式结果，再根据精确诊断收口。

## 8. 强制规则

- 不修改已Verified任务卡、历史Migration和历史Evidence Manifest。
- 不建立第二套Prompt、任务协议、建议稿采用、导入、恢复、模式、主题或搜索数据真源。
- 未接通能力不得显示可用，不得写入半成品权威数据。
- 无AI写作、保存、历史版本、导出和恢复始终必须可用。
- 测试、构建、发布和平台结论必须来自真实运行。
- PR Head检查成功不等于main验证成功；合并后必须复核最终main SHA及`main-verification`。
- 当前没有授权中的开发任务；新增工作必须先完成正式立项。
