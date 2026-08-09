# WorldForge Codex闭环执行手册

> 状态：Active  
> 作用：规定任务从接收、实现、验证、合并、主分支关闭到work同步的完整路径。

## 1. 工作入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/TASK_INDEX.md
→ 当前任务Runtime或ACTIVE_TASK兼容锚点
→ 当前任务卡与专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

授权模式固定为`single-work-pr`。仓库只允许`main`和`work`，所有正式PR必须是`work → main`。

## 2. 任务接收

开始实施前确认：

- 目标、非目标、依赖和验收；
- 当前Runtime状态、允许路径和禁止路径；
- 最新已验证main与work是否一致；
- 数据库、Migration、IPC、事件、错误码、UI、安全、恢复和性能影响；
- 已有、缺失、冲突和可复用能力；
- 是否存在重复实现、并行真源或过期任务假设。

缺失范围、依赖倒置或真实实现与任务卡冲突时，先修正任务卡和实施方案。

## 3. 开工前输出

```text
任务ID：
目标：
非目标：
依赖：
真实基线：
允许路径：
禁止路径：
数据库/Migration影响：
IPC/事件影响：
UI影响：
安全与隐私影响：
恢复影响：
性能影响：
主要风险：
实施步骤：
验证命令：
```

## 4. 标准实施顺序

```text
失败测试或稳定复现
→ Contracts/Domain
→ Migration/Repository
→ Core Use Case
→ Main/Preload IPC
→ 最小Renderer/UI闭环
→ 失败、取消、冲突、只读和恢复路径
→ 自动化测试
→ 人工业务验收
→ 独立复查
→ 文档、追踪与Evidence
```

不涉及的层级必须明确说明“无影响”。

## 5. 编码规则

- TypeScript strict，边界使用strict Zod。
- 不新增未批准生产依赖，不重构无关模块。
- 禁止TODO、空函数、固定成功、演示数据和静默吞错。
- SQLite写入只在Core，通过单一写队列和事务。
- 已发布Migration只追加。
- Provider不查询项目数据、不保存Candidate。
- AI输出先进入建议稿，作者采用后才能修改当前稿。
- Renderer禁止Node、SQLite、文件系统、环境变量和凭据。
- 新功能必须覆盖空、加载、成功、失败、取消、冲突、只读和恢复。

## 6. 唯一分支与PR

```text
最新已验证main
→ work
→ 唯一work → main PR
```

禁止：

- 创建`work/*`、`feat/*`、`fix/*`、`policy/*`、`validate/*`或任何其他分支；
- 创建验证专用PR、纯Evidence PR或纯关闭PR；
- 直接提交main；
- 同时开放第二个work PR。

并行工作只通过本地工作区、文件所有权和提交顺序协调，正式结果统一进入work。

## 7. 测试路由

基础命令：

```bash
pnpm check:language
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm test:e2e
pnpm build
pnpm release:check
```

按任务卡和风险范围执行。未运行、失败或受环境限制必须如实记录。

## 8. Evidence

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

合并前：

- Runtime状态最高登记到`IMPLEMENTED`；
- Evidence绑定来源PR与受检work Head；
- commands只记录真实执行结果。

合并后：

- Main Verification发布最终main验证状态；
- 任务验证状态绑定任务ID、来源PR、来源Head和main SHA；
- 有效状态计算为Verified，无需第二个关闭PR。

## 9. 合并与关闭

```text
Ready Head永久门禁成功
→ Controlled Merge绑定expected_head_sha执行Squash
→ Main Verification核验最终main与来源
→ 发布main-verification和任务验证状态
→ 有效状态变为VERIFIED
```

PR已合并不等于任务Verified；Main Verification成功但任务绑定不一致也不得关闭。

## 10. Work Synchronization

Main Verification成功后，工作流检查：

- 当前main仍等于验证SHA；
- 来源PR是已合并的work → main；
- work仍等于来源受检Head或已不存在；
- 没有新的开放work PR；
- work没有新提交。

全部满足后，将work受控重置到已验证main。条件不满足时停止并报告，禁止覆盖新工作。

## 11. 完成声明

只有以下条件全部成立才能声明闭环：

- 原始目标和非目标逐项复核；
- 实现真实存在于受检work Head；
- 专项验证与关联回归真实通过；
- 六项永久门禁属于同一Head；
- Controlled Merge实际完成；
- Main Verification成功；
- 任务有效状态为Verified；
- Work Synchronization成功；
- 重新读取真实main、work、Runtime和关键文件。

PR可合并、Runner成功、Artifact上传或补丁生成不能单独证明完成。
