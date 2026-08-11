# WorldForge 开发代理快速入口

> `AGENTS.md` 是仓库级完整且唯一的权威指令。本文件只保留高频执行路径；冲突或缺项时立即返回 `AGENTS.md`、机器授权和任务卡。

## 必读顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/TASK_INDEX.md
→ 产品任务时读取当前Schema 2 Runtime
→ 当前任务卡与专项文档
→ 真实代码、测试、Migration、契约和最近提交
```

`TASK_AUTHORIZATION.json` 是分支、PR和main写入规则的机器真源。固定分支为`main/work/governance`：产品任务使用`work → main`，仓库治理使用`governance → main`。

## 两条执行链路

产品任务：

```text
最新已验证main
→ work
→ 实施、测试、审查、文档与Evidence
→ work → main PR
→ 四项永久门禁
→ Controlled Merge（Squash）
→ Main Verification
→ task-verification/<TASK-ID>
→ Integration Branch Synchronization
→ Branch Inventory/Hygiene
→ 下一任务
```

仓库治理：

```text
最新已验证main
→ governance
→ 治理、CI、测试、流程文档或构建治理修改
→ governance → main PR
→ 四项永久门禁
→ Controlled Merge（Squash）
→ Main Verification
→ Integration Branch Synchronization
→ Branch Inventory/Hygiene
```

强制规则：

- 仓库永久只允许`main`、`work`、`governance`。
- 禁止新建第四条任务、修复、验证、发布或临时分支。
- 每条集成lane最多一个开放PR；`work`与`governance`可并行准备，main写入始终串行。
- 禁止直接向`main`提交。
- 四项永久门禁为`pr-policy`、`quality / quality`、`security`、`performance`。
- 产品Runtime固定`executionBranch: work`；治理PR不得伪造产品Runtime或任务Evidence。
- Main Verification成功后来源lane受控同步；另一条lane空闲且仅落后main时自动fast-forward，有开放PR时明确保留，存在无PR分叉时fail-closed。
- `Implemented`不能充当`Verified`；有效Verified由Runtime、来源PR、来源Head、main SHA和任务提交状态共同确认。

## 最短可靠工作路径

```text
确认目标、非目标和范围
→ 核对授权、执行lane、依赖、基线和允许路径
→ 通读真实实现与最近变更
→ 建立失败复现或验收测试
→ 完成最小完整纵向实现
→ 验证主路径、边界、失败、取消、冲突和恢复
→ 执行关联回归
→ 同步契约、Migration、文档、任务状态与Evidence（治理维护按实际范围）
→ 运行Fresh永久门禁
→ 受控合并与Main Verification
→ 重新读取main、work、governance后再声明完成
```

## 五项硬边界

1. 作品数据、配置、日志和备份只保存在用户本机。
2. AI输出先成为建议稿，未经作者采用不能进入当前稿。
3. `project.sqlite` 是唯一作品数据真源。
4. 锁定、修订记录、Hash、事务、项目和路径边界由代码保证。
5. AI只能提议，作者拥有最终裁决权。

任一边界失败立即阻断。

## 工程与验证

- 同时检查应用界面、Preload、Main、本地服务、Repository、SQLite及任务、契约、验证记录链路。
- 禁止无关重构、未经批准的生产依赖、TODO、空实现、固定成功、演示假数据、吞错和并行真源。
- 修复必须复验原问题；新增必须验证主路径、边界路径、失败路径和用户可操作闭环。
- 必须运行任务卡要求的真实命令；Runner成功、PR可合并或Artifact上传不能单独证明完成。
- 正式中文名称以 `docs/product/AUTHOR_LANGUAGE_GLOSSARY.md` 为业务语言真源。
- 人工提交、PR标题、描述和评论使用中文。
