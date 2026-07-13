# WorldForge Codex闭环执行手册

> 状态：Frozen  
> 作用：规定从接收任务、查询文档、规划、编码、测试、复查、同步文档到关闭任务的完整操作路径。

## 1. 工作入口

任何任务从仓库根目录开始，按顺序读取：

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK指向的一任务一文件任务卡
→ 任务卡列出的专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

`ACTIVE_TASK.md`为`NO_ACTIVE_CODING_TASK`时：

- 可以检查仓库、分析问题、补充文档和制定计划。
- 不得自行选择下一个任务修改生产代码。
- 等待作者明确激活任务。

## 2. 任务接收

收到任务后先判断：

1. 是否存在活动任务。
2. 用户命令是否与活动任务一致。
3. 任务卡是否有目标、非目标、允许路径、依赖和验收。
4. 是否需要修改冻结架构、依赖、Schema、IPC或产品范围。
5. 当前仓库是否具备执行所需工具和代码基础。

发现不一致时先报告，禁止边猜边改。

## 3. 开工前输出

编码前必须给出简明计划：

```markdown
任务：<TASK-ID>
目标：
非目标：
影响模块：
允许修改路径：
数据库影响：
IPC/事件影响：
UI影响：
安全与隐私影响：
主要风险：
实施步骤：
验证命令：
```

复杂任务先等待作者确认计划。明确的小范围修复可直接执行，但仍需遵守任务边界。

## 4. 现状检查

必须检查真实仓库，而非只读设计文档：

- 相关包和入口文件。
- 现有测试及失败状态。
- Migration历史。
- IPC Schema与Preload白名单。
- Repository和Use Case。
- UI页面与状态组件。
- 已知TODO、Mock和未接通路径。
- 最近相关提交。

输出“已有、缺失、冲突、可复用”四类结论。

## 5. 实施顺序

推荐端到端顺序：

```text
失败测试或稳定复现
→ contracts/domain
→ Migration/Repository
→ Core Use Case
→ Main/Preload IPC
→ Renderer/UI
→ 失败、取消、冲突、只读和恢复路径
→ 自动化测试
→ 手动业务验收
→ 文档与追踪矩阵
```

不涉及的层级可以跳过，但必须说明无影响。

## 6. 测试先行规则

以下场景优先先写失败测试：

- Bug修复。
- 领域不变量。
- Revision、Hash和LockGuard。
- Candidate采用。
- Migration。
- IPC边界。
- 路径安全。
- Prompt结构化输出。
- 数据恢复。

视觉细节可先实现原型，但最终必须补Playwright或人工截图证据。

## 7. 编码规则

### 通用

- TypeScript strict。
- 边界使用Zod。
- 不新增未批准生产依赖。
- 不顺手重构无关模块。
- 不使用TODO、空函数、固定成功返回、演示数据冒充完成。
- 不静默吞错。
- 不复制相同业务规则到Renderer和Core形成两个真源。

### 数据

- SQLite写入只在Core。
- 所有写入通过单写队列。
- 跨表业务由Use Case控制事务。
- 已发布Migration只追加不修改。
- Version没有更新正文的业务接口。

### AI

- 流式文本只作临时展示。
- 完成或部分保存后形成Candidate。
- Prompt不能代替锁定、Revision、项目和路径边界。
- Prompt集中在`packages/prompts`并版本化。

### UI

- UI状态必须来自真实Core状态。
- 覆盖空、加载、失败、取消、冲突和只读。
- 新手/专业模式共用数据和能力。
- 1280×800可完成核心流程；2K和21:9按专项规格验收。

## 8. 必查失败路径

每个功能至少评估：

| 类别 | 检查内容 |
|---|---|
| 输入 | 缺失、非法、超长、额外字段 |
| 状态 | 目标不存在、已删除、已处理、只读 |
| 并发 | 重复requestId、旧Revision、Hash变化 |
| 锁定 | 更新、删除、移动、合并命中锁定块 |
| 项目 | projectId错误、跨项目实体、路径越界 |
| 任务 | 取消、超时、断流、应用关闭 |
| 数据 | 事务中断、磁盘不足、数据库忙或损坏 |
| 恢复 | 重启后状态、恢复副本、临时文件清理 |

## 9. 测试命令路由

### 所有任务

```bash
pnpm lint
pnpm typecheck
pnpm test
```

### 数据库或Migration

```bash
pnpm test:migration
pnpm test:integration
```

### Electron、Preload、IPC和路径

```bash
pnpm test:security
pnpm test:e2e
```

### 编辑器、锁定、Candidate和Version

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

### Prompt、约束包和Provider

```bash
pnpm test:eval
pnpm test:integration
```

### 性能与高分屏

```bash
pnpm test:perf
pnpm test:e2e
```

命令尚未存在时，活动任务必须明确是否负责建立；不得伪造执行结果。

## 10. 人工验收

自动化测试后，按真实用户路径检查：

1. 从入口进入功能。
2. 完成主要成功流程。
3. 取消一次。
4. 制造一次冲突或失败。
5. 关闭并重启应用。
6. 检查数据、页面位置和恢复能力。
7. UI任务检查目标分辨率、主题、键盘和中文输入。

## 11. 独立复查

完成编码后重新以审查者身份检查：

- 是否真正接通，不只创建文件和接口。
- 是否存在绕过Core的数据写入。
- 是否破坏五项不变量。
- 是否遗漏失败、取消和冲突。
- 是否有未清理Mock、TODO和调试代码。
- 是否新增未登记依赖。
- 文档是否与实现一致。
- 测试是否真实运行。

高风险变更需要第二轮独立审查：Migration、Draft Patch、LockGuard、Candidate采用、Version创建、状态回写、备份恢复、凭据、路径、永久删除和Electron安全配置。

## 12. 文档同步

完成实现后按照变更类型同步：

- 功能：功能清单、V1范围、追踪矩阵、任务卡。
- Schema：数据库Schema、数据字典、Migration和兼容策略。
- IPC：IPC契约、错误码、事件协议和Preload。
- AI：Prompt/Eval规格、registry和支持档案。
- UI：页面/交互规格、响应式、无障碍和验收清单。
- 安全：安全策略、威胁模型和安全用例。
- 性能：预算和性能报告。

README只描述真实可用能力，不提前宣传未实现功能。

## 13. 证据

```text
docs/test-evidence/<TASK-ID>/
├── summary.md
├── commands.txt
├── test-results/
├── screenshots/
├── performance.json
└── known-risks.md
```

`commands.txt`记录实际运行命令和退出状态。测试失败或未运行时如实记录。

## 14. 完成报告

```markdown
# <TASK-ID> 完成报告

## 结论
Verified / Implemented但未验收 / Blocked / 未完成

## 已完成

## 未完成

## 修改文件

## 数据库与Migration

## IPC与事件

## 测试命令与结果

## 手动验收

## 性能与安全

## 已知限制与风险

## 文档同步

## 下一候选任务
```

只有证据齐全才能写`Verified`。

## 15. 关闭任务

1. 更新一任务一文件任务卡状态。
2. 更新`TASK_INDEX.md`。
3. 更新`V1.0_TRACEABILITY_MATRIX.md`。
4. 填写`ACTIVE_TASK.md`完成信息。
5. 确认提交和证据目录。
6. 将`ACTIVE_TASK.md`恢复为`NO_ACTIVE_CODING_TASK`。
7. 等待作者激活下一任务。

Codex不得在关闭任务后自动继续下一任务。

## 16. Blocked流程

无法继续时：

- 停止高风险写入。
- 保留可构建或可回退状态。
- 记录已完成内容。
- 记录阻断原因和复现证据。
- 说明需要的决定、权限、依赖或环境。
- 将任务状态标记Blocked。

禁止用临时绕过将Blocked伪装成完成。

## 17. 反过度设计门

新增抽象、进程、Adapter或平台功能前必须回答：

1. 当前哪个真实任务无法直接完成？
2. 已出现几次重复实现？
3. 最小直接实现为何不足？
4. 新抽象增加哪些接口、状态和测试？
5. 如果未来需求不出现，它是否成为负担？

“以后可能需要”“方便扩展”“行业都这样”不能作为单独理由。

## 18. 发布关闭

发布前必须执行M5任务和P0验收矩阵，输出：

```text
允许发布
有条件允许发布
禁止发布
```

同时列出阻断问题、未验证能力、已知限制、平台差异和证据路径。

## 19. 最终判断标准

开发成功以以下结果判断：

- 作者可以在本地安全、顺畅地写作。
- AI始终是可拒绝、可撤销、可追溯的候选。
- 长篇连续性与恢复机制真实可用。
- 文档、代码、测试和验收结论一致。
- 每个“完成”都能找到证据。
