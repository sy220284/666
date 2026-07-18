# WorldForge Codex闭环执行手册

> 状态：Frozen  
> 作用：规定任务从接收、依赖检查、实现、测试、复查、同步文档到关闭的完整路径。

## 1. 工作入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK指向的独立任务卡
→ 任务卡列出的专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

`ACTIVE_TASK.json`声明授权模式与唯一活动任务。`manual`模式在无活动任务时只允许分析和规划；`continuous-mainline`模式在当前任务Verified后，可自动激活下一张依赖已满足的任务；作者授权的`implementation-mainline`模式在真实编程、必要专项测试和远端质量门通过后记录Implemented与延期验证，再推进下一张实现依赖已满足的任务；`implementation-pr`还要求每张任务通过独立分支、完整PR门禁和受控合并进入`main`。所有模式均禁止并行任务和越过代码、安全、数据或测试失败门。

## 2. 阶段与依赖检查

V1.0按M0—M8执行。收到任务后先确认：

1. 活动任务是否存在且与用户命令一致。
2. 任务卡列出的前置任务是否均为`Verified`；仅在`implementation-mainline`或`implementation-pr`中，`Implemented`可满足后续编程依赖，但不能满足验收或发布。
3. 任务是否引用尚未建立的表、命令、模型、恢复点或UI入口。
4. 当前工作是否属于本阶段，是否提前混入未来阶段。
5. 是否存在同一权威契约的并行修改。

发现依赖倒置或范围越界时先停止并报告。

### 基础产品门

M1必须形成无AI可用产品。M1未Verified前：

- 不得将Prompt、AI Schema、人物弧光、节奏和主题骨架计为主线完成度。
- 不得要求作者配置AI才能完成写作、保存、导出或恢复。
- 不得以临时存储或临时正文模型绕过最终Patch/Revision架构。

## 3. 任务接收

检查任务卡是否明确：

- 目标和非目标；
- 依赖和禁止依赖的未来任务；
- 主要影响路径；
- 数据、IPC、事件和错误码；
- 最小UI闭环；
- 安全、失败、取消、冲突和恢复；
- 自动化和人工验收；
- 完成条件和证据目录。

字段缺失时先补任务卡或启动说明，禁止边猜边改。

## 4. 开工前输出

```markdown
任务：
目标：
非目标：
已Verified依赖：
禁止提前引入：
影响模块：
允许修改路径：
数据库影响：
IPC/事件影响：
UI影响：
安全与隐私影响：
恢复影响：
性能影响：
主要风险：
实施步骤：
验证命令：
```

## 5. 现状检查

必须检查真实仓库：

- 相关包和入口文件；
- 当前测试和失败状态；
- Migration历史；
- IPC Schema与Preload白名单；
- Repository、Use Case和写入路径；
- UI页面、状态和不可达入口；
- TODO、Mock、空实现和固定成功；
- 最近相关提交。

输出四类结论：已有、缺失、冲突、可复用。

## 6. 标准实施顺序

```text
失败测试或稳定复现
→ contracts/domain
→ Migration/Repository
→ Core Use Case
→ Main/Preload IPC
→ 最小Renderer/UI闭环
→ 失败、取消、冲突、只读和恢复路径
→ 自动化测试
→ 手动业务验收
→ 独立复查
→ 文档与追踪矩阵
→ 证据
```

不涉及的层级可以跳过，但必须明确说明“无影响”。

## 7. 最小UI规则

任何用户功能任务必须在本任务内可操作，至少覆盖：

- 空状态；
- 加载/进行中；
- 成功；
- 失败；
- 取消；
- 冲突；
- 只读；
- 恢复。

M7负责统一导航、主题和交互，不负责第一次接通业务功能。

## 8. 测试先行

以下场景优先写失败测试：

- 领域不变量；
- Revision、Hash和LockGuard；
- Candidate采用；
- Migration；
- IPC边界；
- 路径安全；
- Prompt和结构化输出；
- 数据恢复；
- Bug修复；
- 性能和安全风险。

视觉原型最终必须补桌面E2E或人工截图证据。

## 9. 编码规则

### 通用

- TypeScript strict。
- 边界使用strict Zod。
- 不新增未批准生产依赖。
- 不顺手重构无关模块。
- 不使用TODO、空函数、固定成功、演示数据冒充完成。
- 不静默吞错。
- 不创建未来“可能需要”的Schema和扩展点。
- 不复制业务规则到Renderer和Core形成两个真源。

### 数据

- SQLite写入只在Core。
- 所有写入通过单写队列。
- 跨表业务由Use Case控制事务。
- 已发布Migration只追加不修改。
- Version没有正文更新接口。
- 高风险操作复用统一恢复点。

### AI

- Provider不查询项目数据、不保存Candidate。
- 流式文本只作临时展示。
- 完成或明确部分保存后形成Candidate。
- Prompt不能代替锁定、Revision、项目和路径边界。
- Prompt集中在`packages/prompts`并版本化。
- 未验证模型不宣称稳定。

### UI

- UI状态来自真实Core。
- 新手/专业模式共用数据和命令。
- 两种视觉方向不分叉业务逻辑。
- 未实现功能不展示可用入口。
- 1280×800可完成核心流程；2K和21:9按专项规格验收。

## 10. 必查失败路径

| 类别 | 检查内容 |
|---|---|
| 输入 | 缺失、非法、超长、额外字段 |
| 状态 | 目标不存在、已删除、已处理、只读 |
| 并发 | 重复requestId、旧Revision、Hash变化 |
| 锁定 | 更新、删除、移动、拆分、合并命中锁定 |
| 项目 | projectId错误、跨项目实体、路径越界 |
| 任务 | 取消、超时、断流、页面切换、应用关闭 |
| 数据 | 事务中断、磁盘不足、数据库忙或损坏 |
| 恢复 | 重启、恢复副本、临时文件清理、原项目保护 |
| UI | 空、加载、失败、冲突、只读、恢复 |

## 11. 测试命令路由

所有任务：

```bash
pnpm lint
pnpm typecheck
pnpm test
```

数据库/Migration：

```bash
pnpm test:migration
pnpm test:integration
```

Electron/IPC/路径/安全：

```bash
pnpm test:security
pnpm test:e2e
```

编辑器/Candidate/锁定/Revision：

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

Prompt/约束包/Provider：

```bash
pnpm test:eval
pnpm test:integration
```

性能/高分屏：

```bash
pnpm test:perf
pnpm test:e2e
```

命令尚未存在时如实说明；只有负责该基础能力的活动任务可以创建。

## 12. 人工验收

按真实用户路径检查：

1. 从正常入口进入。
2. 完成主要成功流程。
3. 取消一次。
4. 制造一次冲突或失败。
5. 关闭并重启应用。
6. 检查数据、位置和恢复。
7. UI任务检查目标分辨率、主题、键盘、焦点和中文输入。

M1退出验收必须完整走通：

```text
新建项目
→ 建卷章
→ 写正文
→ 自动保存
→ 手动Version/定稿
→ TXT/Markdown导出
→ 关闭重启
→ 恢复副本
```

## 13. 独立复查

检查：

- 功能是否真实接通；
- 是否使用未来阶段占位；
- 是否存在绕过Core的数据写入；
- 是否破坏五项不变量；
- 是否遗漏失败、取消、冲突和恢复；
- 是否有Mock、TODO和调试代码；
- 是否新增未登记依赖；
- 文档是否与实现一致；
- 测试是否真实运行。

Migration、Patch、LockGuard、Candidate采用、Version、状态回写、备份、凭据、路径、永久删除和Electron安全需要第二轮独立审查。

## 14. 文档同步

- 功能：范围、功能清单、追踪矩阵、任务卡。
- 依赖：路线图、任务索引、里程碑摘要、执行入口。
- Schema：数据库Schema、数据字典、Migration、兼容策略。
- IPC：契约、错误码、事件、Preload。
- AI：Prompt/Eval、Registry、支持档案。
- UI：页面、交互、响应式、无障碍、验收清单。
- 安全：安全策略、威胁模型、安全用例。
- 性能：预算和报告。

README只描述真实可用能力。

## 15. 证据与关闭

```text
docs/test-evidence/<TASK-ID>/
├── summary.md
├── commands.txt
├── test-results/
├── screenshots/
├── performance.json
└── known-risks.md
```

`commands.txt`记录真实命令、退出码和结果。失败或未运行必须如实记录。

任务完成后：

1. 更新任务卡状态。
2. 更新`TASK_INDEX.md`。
3. 更新追踪矩阵。
4. 保存证据。
5. 同步`ACTIVE_TASK.json`与`ACTIVE_TASK.md`。
6. `manual`模式恢复为`NO_ACTIVE_CODING_TASK`；`continuous-mainline`模式自动激活下一张依赖已满足的任务；`implementation-mainline`模式登记延期验证后激活下一张实现依赖已满足的任务；`implementation-pr`模式在登记延期验证后准备下一任务状态，并等待当前PR受控合并后生效。
7. 自动推进前再次执行任务依赖、允许路径、追踪和证据校验。
