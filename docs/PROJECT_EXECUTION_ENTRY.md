# WorldForge 项目执行统一入口

> 状态：VERIFIED_HOLD  
> 面向：开发、审查、测试、治理与发布

## 1. 启动顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/TASK_INDEX.md
→ 当前任务Runtime或ACTIVE_TASK兼容锚点
→ 当前任务卡与专项真源
→ 现有代码、测试、Migration、IPC与Evidence
```

`TASK_AUTHORIZATION.json`是分支、PR和main写入规则的全局机器真源。当前授权模式为`single-work-pr`。`ACTIVE_TASK.json`与`ACTIVE_TASK.md`只保留旧状态机兼容作用，不得覆盖Schema 2授权。

## 2. 当前仓库状态

```text
仓库状态：VERIFIED_HOLD
稳定分支：main
唯一工作分支：work
活动开发任务：0
直接main提交：禁止
允许正式PR：仅work → main
开放正式PR上限：1
合并方式：Squash Controlled Merge
```

M9、M10-01和M10-02均已完成历史Verified闭环。后续开发必须重新立项，建立任务卡和Runtime，并在唯一`work`分支执行。

## 3. 标准闭环

```text
从最新已验证main受控同步work
→ 冻结任务范围、依赖和允许路径
→ 在work完成实现、测试、文档与Evidence
→ 创建或更新唯一work → main PR
→ Draft与Ready永久门禁
→ Runtime登记IMPLEMENTED及来源绑定
→ Controlled Merge以受检Head执行Squash
→ Main Verification核验最终main SHA和来源PR
→ 发布main-verification与任务验证状态
→ 任务有效状态转为VERIFIED
→ Work Synchronization在CAS条件满足时重置work到main
→ 重新读取main、work和任务状态
```

禁止独立任务分支、验证分支、治理分支、纯Evidence分支和纯关闭PR。

## 4. 状态解释

- `PLANNED`：已立项，尚未进入正式实施。
- `IN_PROGRESS`：正在唯一`work`上实施。
- `IMPLEMENTED`：受检Head包含完整实现和合并前Evidence，等待主分支验证。
- `VERIFICATION_PENDING`：计算状态；Main Verification尚未成功。
- `VERIFIED`：计算状态；Runtime绑定、来源PR、来源Head、main SHA和任务验证提交状态全部一致。
- `VERIFIED_HOLD`：当前没有自动激活的后续任务。

`Implemented`不能满足发布或最终验收。Verified不再依赖第二个治理关闭PR。

## 5. Work Synchronization

Main Verification成功后，只有以下条件全部成立才可重置`work`：

- 受检main仍是当前main；
- 来源PR确实是已合并的`work → main`；
- 当前work仍等于来源受检Head，或已被GitHub自动删除；
- 没有新的开放`work → main` PR；
- work没有合并后的新提交。

任一条件不满足时停止并报告，禁止覆盖新工作。

## 6. GitHub Actions工具链

```text
Runner：Ubuntu 24.04 / Windows latest / macOS latest
Node：24
pnpm：11.13.1
安装：pnpm install --frozen-lockfile --prefer-offline
Linux Electron显示依赖：fonts-noto-cjk、xvfb
Windows中文输入：Microsoft Pinyin
```

本地缺少同版工具或无法联网时，从永久Toolchain Export或Engineering Validation获取同版工具和诊断，不得使用其他版本冒充最终结论。

## 7. 强制规则

- 不修改历史Verified任务卡、Migration和Evidence来源记录。
- 新建及活动Runtime使用`executionBranch: work`；历史来源分支字段保持冻结。
- Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。
- AI输出先进入建议稿，设定更新由作者裁决，`project.sqlite`保持唯一作品真源。
- PR Head成功不等于main验证成功；合并后必须核验最终main SHA和Main Verification。
- 未真实运行、未写入真实PR Head或未完成主分支验证的内容不得声明完成。
