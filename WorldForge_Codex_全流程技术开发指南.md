# WorldForge Codex 全流程技术开发指南

> 适用基线：WorldForge V6.5《实施安全、并发与高分屏适配冻结最终工程设计文档》  
> 文档用途：指导 Codex 从空仓库开始完成架构搭建、功能实现、测试、审查、验收与发布准备  
> 目标版本：V1.0 核心写作闭环；V1.5 超长篇记忆与 AI 项目日记增强  
> 工作原则：本地优先、作者控制、候选隔离、单一数据真源、代码硬约束、证据化验收

---

## 0. 文档定位

本文件不是产品需求文档的替代品，而是将 V6.5 方案转换成 Codex 可执行的工程路线。

Codex 每次任务必须同时遵守：

阅读顺序：`AGENTS.md` → 本开发指南 → V6.5可执行总规格 → 当前里程碑任务卡 → 现有代码、测试和数据库迁移。

出现冲突时，唯一权威声明见 `docs/INDEX.md` §1，本文件不重复定义。

禁止用“现有代码已经这样写了”否定冻结方案。发现现有实现偏离时，应先报告差异，再修正或提交变更建议。

---

## 1. Codex 使用方式

Codex 官方使用 `AGENTS.md` 作为仓库级持久指令文件。Codex 会在开始工作前读取该文件；复杂任务应先规划，再编码、测试和审查。

推荐使用方式：

```bash
# 在仓库根目录启动
codex

# 验证仓库指令已加载
codex --ask-for-approval never "概述你加载的项目指令、架构不变量和必跑检查。"

# 非交互执行一个已写清的任务
codex exec "按 docs/tasks/M1-EDITOR-001.md 完成任务，运行全部要求检查并输出证据。"
```

复杂功能建议先进入 Plan 模式，要求 Codex：

1. 阅读指定文档和相关代码。
2. 列出影响文件、数据库、IPC和测试。
3. 识别风险和未决问题。
4. 给出最小实施顺序。
5. 等待计划确认后再编码。

官方参考：

- AGENTS.md：https://developers.openai.com/codex/guides/agents-md
- Codex 最佳实践：https://developers.openai.com/codex/learn/best-practices
- Codex CLI：https://developers.openai.com/codex/cli

---

## 2. 产品边界冻结

### 2.1 V1.0必须解决

V1.0只解决单个作者在本地完成长篇小说的核心闭环：

```text
项目创建
→ 规划人物/设定/大纲/场景
→ 块级正文编辑
→ AI生成候选
→ 候选比较与采用
→ 定稿与状态确认
→ 连续性维护
→ 搜索/校对/备份/导出
```

### 2.2 V1.0明确不做

- 云存储、云同步、账号后台、作品托管。
- WorldForge 模型请求中转。
- 本地模型下载、安装、容器和显存管理。
- 向量数据库、Embedding、Rerank。
- MCP、CRDT、多人协作、插件市场。
- 自动发布、平台登录、读者反馈分析。
- 自动学习作者创作偏好。
- 无人审核批量生成。
- 大规模运营、社区、成就系统。

### 2.3 V1.5再做

以下能力只能以独立 Epic 实施，不得阻塞 V1.0：

- 完整 L0-L5 自动分层记忆调度。
- 热/温/冷数据自动迁移。
- 剧情弧与卷级自动汇总。
- 卷级连续性检查点传播。
- 定时 AI 项目日记。
- 300万—500万字完整压力适配。
- 条件性语义检索。
- 可选实时项目加密。

---

## 3. 五项不可变原则

任何实现、重构和优化不得破坏以下原则。

### INV-001 本地数据边界

正文、设定、索引、日志、备份、Prompt 与评测数据只保存在用户本机。外部 API 调用由本机直接发起，不经过 WorldForge 服务。

### INV-002 Candidate 隔离

AI 结果先写入 Candidate。未经作者明确接受，不得写入活动 Draft。

### INV-003 SQLite 唯一真源

`project.sqlite` 是单项目唯一权威数据源。Renderer 状态、Tiptap JSON、缓存、FTS 索引和导出文件均不得成为权威来源。

### INV-004 代码硬约束

锁定块、Revision、不可变 Version、项目边界和路径边界必须由代码校验。Prompt 不能承担安全保证。

### INV-005 作者裁决

AI 可生成候选、校验意见、状态提案和项目日记，但不能直接修改静态设定、定稿正文和权威状态。

---

## 4. 总体架构

```text
┌───────────────────────────────────────────┐
│ Electron Main                             │
│ 窗口、生命周期、凭据入口、Core进程监管     │
└────────────────┬──────────────────────────┘
                 │ 白名单IPC / MessagePort
┌────────────────▼──────────────────────────┐
│ Renderer                                  │
│ React + TypeScript + Tiptap + Zustand     │
│ 只负责界面、编辑事务和用户操作             │
└────────────────┬──────────────────────────┘
                 │ Zod校验命令
┌────────────────▼──────────────────────────┐
│ Core Service Utility Process              │
│ SQLite单写、文件、FTS5、AI调用、校验、备份 │
└───────────────────────────────────────────┘
```

### 4.1 Electron Main

负责：

- 创建窗口。
- 处理应用生命周期。
- 启动、监管和重启 Core。
- 系统菜单、文件选择器、外链打开。
- Credential Store 入口。
- 窗口和显示器状态恢复。

禁止：

- 保存正文。
- 执行业务 SQL。
- 直接调用模型。
- 将通用 `ipcRenderer` 暴露给 Renderer。

### 4.2 Renderer

负责：

- React 页面与路由。
- Tiptap 编辑器。
- 本地 UI 临时状态。
- 用户输入、命令发起和反馈展示。
- AI 流式临时预览。

禁止：

- 直接打开 SQLite。
- 直接访问文件系统和环境变量。
- 读取 API 密钥。
- 将流式结果直接写入 Draft。
- 在 Zustand 中持久化权威正文。

### 4.3 Core Service

负责：

- `app.sqlite` 与每项目 `project.sqlite`。
- 所有数据库写事务。
- Draft/Block/Version/Candidate。
- Provider 调用和流式事件。
- FTS5、基础校对、校验。
- 导入导出、备份恢复。
- Revision、锁定和路径范围校验。

Core 初期为一个 Utility Process，但必须内部隔离：

```text
AI异步流式通道
数据库单写队列
CPU密集任务调度
```

达到量化阈值后才拆分 AI 进程。

---

## 5. 技术栈冻结

| 层级 | 技术 |
|---|---|
| 桌面壳 | Electron |
| UI | React + TypeScript + Vite |
| 状态管理 | Zustand |
| 编辑器 | Tiptap + ProseMirror |
| 数据库 | SQLite + better-sqlite3 |
| 全文检索 | SQLite FTS5 |
| 契约校验 | Zod + JSON Schema |
| IPC | Electron IPC + MessagePort |
| 单元/集成测试 | Vitest |
| 桌面 E2E | Playwright |
| Monorepo | pnpm workspace |
| 打包 | electron-builder |
| 样式 | Tailwind CSS + Radix UI |
| 日志 | 本地结构化日志 |
| 密钥 | OS Credential Store |

新增生产依赖前，Codex 必须：

1. 说明现有依赖为什么不能满足。
2. 列出包体积、维护状态和许可证。
3. 获得明确批准。
4. 更新依赖清单和许可证报告。

---

## 6. 目标仓库结构

```text
worldforge/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
├── prettier.config.mjs
├── apps/
│   └── desktop/
│       ├── main/
│       ├── preload/
│       └── renderer/
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── core-service/
│   ├── editor-core/
│   ├── prompts/
│   └── testkit/
├── migrations/
│   ├── app/
│   └── project/
├── docs/
│   ├── specs/
│   ├── architecture/
│   ├── tasks/
│   ├── decisions/
│   ├── test-evidence/
│   └── release/
├── evals/
│   ├── fixtures/
│   ├── baselines/
│   └── reports/
├── tests/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   ├── performance/
│   └── migration/
└── scripts/
```

### 6.1 包职责

#### `packages/contracts`

- IPC 信封。
- IPC 命令输入输出。
- 错误码。
- AI 结构化输出 Schema。
- 导入导出 Manifest。
- 不包含业务实现。

#### `packages/domain`

- 领域实体。
- 领域枚举。
- 不变量校验。
- 纯函数。
- 不依赖 Electron、React、SQLite。

#### `packages/core-service`

- SQLite 驱动。
- Repository。
- 写队列。
- Migration。
- Provider。
- FTS5。
- 备份、导入、导出。
- 业务 Use Case。

#### `packages/editor-core`

- Tiptap Schema。
- Block Patch。
- 锁定插件。
- Selection 与 logicalBlockId 映射。
- 编辑器内容和领域 Block 的转换。

#### `packages/prompts`

- Prompt 模板。
- Prompt 版本。
- 约束包序列化。
- 结构化输出解析。
- 不直接调用数据库。

#### `packages/testkit`

- 临时项目工厂。
- Provider Stub。
- 流式故障注入。
- SQLite 故障夹具。
- 中文长文本和百万字模拟数据。

---

## 7. 标准工程命令

根目录 `package.json` 至少提供：

```json
{
  "scripts": {
    "dev": "pnpm --filter @worldforge/desktop dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "format:check": "prettier --check .",
    "test": "pnpm -r test",
    "test:unit": "pnpm -r test:unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:security": "vitest run tests/security",
    "test:migration": "vitest run tests/migration",
    "test:perf": "vitest run tests/performance",
    "test:eval": "pnpm --filter @worldforge/prompts eval",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build",
    "package": "pnpm --filter @worldforge/desktop package"
  }
}
```

Codex 不得声称完成，除非：

- 运行了任务要求的最小检查。
- 运行了受影响包的测试。
- 高风险变更运行了专项检查。
- 给出命令、退出码和结果摘要。

---

## 8. 分支与任务策略

### 8.1 一任务一分支

```text
main
└── feat/m0-core-write-queue
└── feat/m1-draft-editor
└── fix/candidate-revision-conflict
```

命名：

```text
feat/<milestone>-<short-name>
fix/<scope>-<short-name>
test/<scope>-<short-name>
docs/<scope>-<short-name>
```

### 8.2 任务粒度

一个 Codex 任务应满足：

- 预计修改不超过一个核心领域。
- 主要文件不超过约 15 个。
- 能在一组明确验收标准下独立验证。
- 不同时修改数据库模型、UI 设计和 Provider 协议，除非任务本身是端到端切片。

### 8.3 并行工作边界

可以并行：

- UI 纯视觉组件与 Core Repository。
- Provider Stub 与数据库 Migration。
- 导入解析器与候选 Diff 测试夹具。

不得并行修改同一权威契约：

- `packages/contracts` 同一 Schema。
- 同一 Migration 序列。
- Draft/Candidate/Version 核心模型。
- IPC 命令名和错误码。

多 Agent 并行时，每个 Agent 使用独立 worktree 或分支，最后由单独审查任务合并。

---

## 9. Codex 标准执行循环

每个任务严格按以下顺序执行。

### 9.1 读取

Codex 首先阅读：

1. `AGENTS.md`
2. 当前任务卡。
3. 相关设计章节。
4. 相关包 README。
5. 现有测试。
6. 相关 Migration 和 IPC Schema。

### 9.2 复述任务

输出：

- 目标。
- 非目标。
- 影响模块。
- 主要风险。
- 验收命令。
- 是否需要澄清。

### 9.3 编写执行计划

复杂任务必须创建或更新：

```text
docs/tasks/<TASK-ID>.md
```

计划包含：

- 修改清单。
- 数据和契约变化。
- 测试清单。
- 回滚策略。
- 分步提交点。

### 9.4 先建立失败证据

优先写测试或复现脚本：

- Bug：先证明当前失败。
- 新不变量：先写失败测试。
- UI：先写组件测试或 E2E 任务。
- 性能：先写基准脚本。
- 安全：先写攻击/越权测试。

### 9.5 最小实现

- 只实现任务范围。
- 不顺手重构无关模块。
- 不新增“未来可能需要”的扩展点。
- 不用 TODO、空实现和固定假数据代替功能。

### 9.6 运行检查

按任务类型运行相应矩阵。

### 9.7 自审

Codex 必须检查：

- 是否破坏五项不变量。
- 是否存在跨项目写入。
- 是否存在锁定块绕过。
- 是否漏掉失败、取消、冲突路径。
- 是否将业务数据只放在 Renderer。
- 是否新增未批准依赖。
- 是否缺 Migration 或回滚保护。
- 是否在日志中泄露正文或密钥。

### 9.8 输出证据

完成报告必须包含：

```text
变更摘要
修改文件
数据库/IPC变化
测试命令与结果
手动验证步骤
截图或录屏路径（UI任务）
已知限制
剩余风险
建议后续任务
```

---

## 10. 任务卡模板

任务卡模板唯一定义在 `docs/tasks/TASK_TEMPLATE.md`，字段以该文件为准，本文件不重复维护副本。

---

# 第一阶段：M0 工程与安全底座

## 11. M0-01 Monorepo 与质量工具

### 目标

建立可编译、可测试、可打包的最小仓库。

### 交付

- pnpm workspace。
- Electron Main/Preload/Renderer 空壳。
- 六个 packages。
- TypeScript strict。
- ESLint、Prettier、Vitest、Playwright。
- CI 基础流水线。
- 根 `AGENTS.md`。

### 强制配置

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true
  }
}
```

### 验收

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

禁止：

- 用 `any` 大面积绕过类型。
- 跳过测试配置。
- 把所有代码放在 `apps/desktop`。

---

## 12. M0-02 Electron 安全 Spike

### 目标

冻结安全配置和 preload 白名单。

### 必须实现

```ts
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  preload: PRELOAD_PATH
}
```

- 严格 CSP。
- 禁止 Renderer Node 权限。
- 禁止任意导航和新窗口。
- 外链交由系统浏览器。
- preload 每项 API 使用具名方法。
- 所有参数 Zod 校验。
- 正式版开发者工具策略。
- Electron Fuses Spike。

### 测试

- Renderer 访问 `process`、`require`、文件系统失败。
- 未授权 IPC 命令不可调用。
- 路径穿越被拒绝。
- 远程 URL 不能在应用窗口打开。
- 外链只打开系统浏览器。

### 退出条件

`SEC-01` 全部通过。

---

## 13. M0-03 Core、SQLite 与写队列

### 初始化参数

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

### 写入模型

```text
IPC命令
→ Zod验证
→ 项目边界校验
→ 单写队列
→ SQLite事务
→ 领域事件/结果
→ IPC响应
```

### 必须实现

- `AppDatabase` 与 `ProjectDatabase` 分离。
- Migration Runner。
- 单写队列。
- 事务封装。
- 只读查询通道。
- WAL 检查点策略。
- 关闭项目和异常退出恢复。
- `quick_check`、`integrity_check` 接口。

### 验收

- 100次 AI 流式任务与 800ms 自动保存并发，无 `SQLITE_BUSY` 泄漏。
- 无丢写。
- 无跨 Revision 覆盖。
- 异常退出后可恢复。

---

## 14. M0-04 IPC 与流式 MessagePort

### 通用信封

```ts
interface IpcMessage<T> {
  protocolVersion: 1;
  messageId: string;
  type: string;
  payload: T;
  sentAt: string;
}
```

### 流式事件

```ts
type AIStreamEvent =
  | { type: 'started'; runId: string }
  | { type: 'stage'; runId: string; stage: string }
  | { type: 'delta'; runId: string; sequence: number; text: string }
  | { type: 'usage'; runId: string; input: number; output: number }
  | { type: 'completed'; runId: string }
  | { type: 'cancelled'; runId: string }
  | { type: 'failed'; runId: string; errorCode: string };
```

### 规则

- 不逐 Token 发送。
- 每 20—50ms 或达到批量字符阈值后发送。
- 每个 `delta` 有连续 `sequence`。
- Renderer 只展示临时流。
- Candidate 在完成后一次持久化。
- 消费端拥塞时合并未渲染增量。
- 取消请求 500ms 内反馈。
- 切换章节不串稿、不取消。

### 验收

`IPC-01`、`IPC-02` 全部通过。

---

## 15. M0-05 高分屏与窗口恢复原型

### 测试矩阵

- 1280×800。
- 2560×1440：100%、125%、150%。
- 3440×1440。
- 3840×1600。
- 混合 DPI 双显示器。
- 1024×640 有效视口。

### 必须实现

- DIP 坐标保存。
- `displayId`、`scaleFactor`、窗口 bounds。
- 三档正文版心：680/760/860 CSS px。
- 界面缩放与正文字号独立。
- 超宽屏居中/偏左/偏右。
- `<1100px` 右栏抽屉；`<900px` 左栏也抽屉。
- 候选比较自动切换双栏/上下/单稿。
- 不出现整页横向滚动。

---

# 第二阶段：M1 编辑与数据核心

## 16. M1-01 项目与工作空间

### 数据布局

```text
WorldForgeData/
├── app.sqlite
└── workspaces/
    └── <project>.worldforge/
        ├── manifest.json
        ├── project.sqlite
        ├── attachments/
        ├── exports/
        ├── backups/
        └── logs/
```

### 功能

- 创建、打开、关闭、移动项目。
- 最近项目。
- Schema 迁移。
- 路径归一化。
- 项目 ID 与路径绑定。
- 回收站根结构。
- 异常项目只读打开。

### 验收

- 不能通过 `../` 或符号链接访问项目外文件。
- 项目迁移失败保持旧库可用。
- `app.sqlite` 不含正文。

---

## 17. M1-02 Draft 与块级正文

### 模型

```ts
interface DraftBlock {
  id: string;
  draftId: string;
  logicalBlockId: string;
  orderKey: string;
  type: 'paragraph' | 'dialogue' | 'heading' | 'separator';
  text: string;
  source: 'manual' | 'ai' | 'mixed' | 'imported';
  locked: boolean;
  contentHash: string;
  revision: number;
}
```

### 规则

- 每章一个活动 Draft。
- 一次事务只将 Draft Revision 增加 1。
- 自动保存按编辑事务提交，不逐按键写数据库。
- `logicalBlockId` 跨 Candidate/Version 追踪。
- `id` 是版本内记录身份，不要求跨版本相同。
- `orderKey` 使用带间隔整数或字符串排序；只在需要时事务性重平衡。

### 编辑器行为

- 粘贴清理网页字体、颜色和字号。
- 保留段落、标题、分隔符和可选粗斜体。
- IME composition 期间不触发破坏性事务。
- 章节内查找。
- 撤销重做。
- 超长章节虚拟化或分块渲染策略。

---

## 18. M1-03 锁定与 Block Patch

### 双层保护

1. Tiptap 插件阻止 UI 修改。
2. Core `LockGuard` 再次校验。

### Patch 示例

```ts
type BlockPatch =
  | { op: 'insert'; afterLogicalBlockId?: string; block: NewBlock }
  | { op: 'update'; logicalBlockId: string; expectedHash: string; text: string }
  | { op: 'delete'; logicalBlockId: string; expectedHash: string }
  | { op: 'move'; logicalBlockId: string; afterLogicalBlockId?: string };
```

### 验收

- 任何 AI、批量替换、章节拆并操作都不能修改锁定块。
- 深色、护眼、高对比主题可识别锁定状态。
- 操作跳过锁定块时显示低干扰摘要。

---

## 19. M1-04 Candidate 与 Version

### Candidate

- AI 输出。
- `pending/accepted/discarded`。
- `complete/partial`。
- 记录 `baseDraftRevision`。
- 不直接成为 Draft。

### Version

- 不可变。
- 不提供业务 UPDATE。
- 恢复历史版本时创建新 Draft。
- 定稿 Version 可导出。

### Candidate 接受

```text
读取当前Draft
→ 检查baseRevision
→ logicalBlockId结构Diff
→ Hash冲突检查
→ 锁定检查
→ 单一事务应用
→ Revision +1
→ 创建candidate_apply_record
```

### 撤销

- Candidate 采用作为原子事务。
- `Ctrl/Cmd+Z` 可整体撤销。
- 重启后可回到采用前检查点。
- 撤销不删除 Candidate。

---

## 20. M1-05 回收站与恢复

支持：

- 卷、章节、场景软删除。
- 恢复到原位置。
- 原位置冲突时选择新位置。
- 永久删除二次确认。
- 永久删除前检查 Version、状态、伏笔和引用。
- 重大删除前恢复点。

---

# 第三阶段：M2 规划与连续性

## 21. M2-01 作品任务书、大纲、章节、场景

实现：

- 简洁作品任务书。
- PlotNode 树。
- Volume、Chapter。
- SceneBeat。
- 场景卡与正文单向安全关联。

规则：

- 修改规划不得自动重写正文。
- 移动已有正文关联场景时必须确认。
- 删除场景卡不删除正文。
- 正文新增内容可由作者选择转成场景卡。

---

## 22. M2-02 人物与世界设定

实体：

- 人物。
- 地点。
- 势力。
- 道具。
- 能力。
- 规则。
- 事件。
- 自定义实体。

分离：

```text
CanonFact 静态事实
EntityState 动态状态
```

AI 不得直接修改 `CanonFact`。

---

## 23. M2-03 时间线、知情信息、伏笔

### 时间线

V1只做：

- 开始/结束。
- 精度。
- 人物、地点。
- 前置事件。
- 顺序和同地冲突。

不做完整历法引擎。

### 知情信息

记录：

- 信息。
- 人物。
- 得知时间。
- 相信/怀疑/误解。
- 来源。

### 伏笔

状态：

```text
planned
planted
reinforced
partially_revealed
revealed
cancelled
```

V1只做关系表，不做复杂图算法。

---

## 24. M2-04 章节尾快照与状态提案

流程：

```text
章节定稿
→ AI或规则提取动态变化候选
→ 附正文证据
→ 作者接受/修改/拒绝
→ 更新EntityState
→ 生成EndingSnapshot
```

硬规则：

- AI 提案不是权威事实。
- 无证据不能自动进入状态。
- 静态设定只能提示冲突。
- 返修旧章后标记后续派生数据 stale，不自动改后文。

---

# 第四阶段：M3 AI 生成闭环

## 25. M3-01 Provider

### V1协议

- OpenAI compatible。
- Anthropic。
- Custom（必须有明确适配器）。

### 最小能力

```ts
interface ModelCapabilities {
  streaming: boolean;
  structuredOutput: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
}
```

禁止预建大量能力位。

### 密钥

- 数据库只保存 `credentialRef`。
- macOS Keychain。
- Windows Credential Manager/DPAPI。
- Linux Secret Service；不可用时会话级密钥。
- 不允许明文文件降级。

---

## 26. M3-02 约束包

优先级：

```text
P0 程序硬约束
P1 章节必须满足
P2 高相关设定
P3 文风与角色声音
P4 辅助背景
```

组装顺序：

1. 当前章节和场景。
2. 前章尾状态。
3. 当前人物/地点/物品状态。
4. 绑定伏笔和知情信息。
5. 作品规则。
6. FTS5 补充。
7. 时间有效性过滤。
8. 去重、冲突标记。
9. Token 预算裁剪。

约束包必须有：

- `contentHash`。
- 来源 ID。
- 版本 ID。
- 优先级。
- 预计 Token。
- 裁剪日志。

---

## 27. M3-03 T0/T1

### T0

输出结构化骨架：

- 场景顺序。
- 事件概括。
- 冲突升级。
- 人物行为。
- 信息释放。
- 结尾钩子。
- 字数比例。

### T1

输入：

- 选定骨架。
- 约束包。
- 文风和角色声音。
- 字数目标。
- 锁定内容摘要。

输出 Candidate。

### 降级

T0/T1 未通过本地 Eval 时：

- 不得成为必经流程。
- 允许自主写作和局部改写。
- 高风险功能显示模型支持级别。

---

## 28. M3-04 快速改写与结构性改写

### 快速改写

适用：

- 单自然段。
- 不跨场景。
- 预期长度变化不超过约 50%。

交互：

```text
选区
→ 发起改写
→ 内联预览
→ 应用/换一个/取消
→ 应用后可立即撤销
```

仍需：

- 锁定检查。
- AI 来源标记。
- 原子撤销。

### 结构性改写

跨段、场景或整章时进入完整 Candidate 审阅。

无法可靠判断时，默认升级为结构性改写。

---

## 29. M3-05 候选 Diff 与冲突

优先级：

1. `logicalBlockId` 匹配。
2. 识别新增、删除、拆分、合并。
3. 块内字符级中文 Diff。
4. 显示来源和冲突。

视图：

- 双栏。
- 单稿。
- 只看差异。
- 折叠未改段。
- 场景导航。
- 同步滚动。
- 窄屏上下对照。

性能：

- 5000字中文首屏 ≤500ms。
- 完整 Diff ≤1.2s。
- 可取消。
- 不阻塞编辑器。

---

# 第五阶段：M4 完整交付

## 30. M4-01 校验和修订

校验分层：

- 确定性。
- 统计。
- AI语义。

每条问题必须有：

- 类型。
- 严重级别。
- 正文锚点。
- 预期依据。
- 说明。
- 建议动作。
- 状态。

降噪：

- 本章忽略。
- 项目静音。
- 降低等级。
- 标记误报。
- 首页最多显示2条主动提示。

AI语义校验只作为风险提示。

---

## 31. M4-02 搜索、替换、词典和批注

- 当前章搜索。
- 全项目搜索。
- FTS5。
- 正则仅放高级入口。
- 批量替换先预览。
- 锁定块默认跳过。
- 项目专名词典。
- 段落批注。
- StoryTodo。
- 最小研究笔记。

---

## 32. M4-03 导入导出

### TXT

- UTF-8、UTF-16、GB18030 候选识别。
- 置信度不足时人工选择。
- 分章预览。

### DOCX

- 只接受 `.docx`。
- 拒绝 `.docm`。
- 不执行宏、OLE、外链。
- ZIP 大小、文件数、压缩比和路径穿越限制。
- 只提取基础正文结构。
- 临时隔离目录。
- 失败/取消无半成品。

### 导出

- TXT。
- Markdown。
- DOCX。
- 原子临时文件 + 重命名。
- 只导出选定 Version。
- 复杂格式不从编辑器 HTML 直接复制。

---

## 33. M4-04 三轨备份与恢复

| 轨道 | 保留 |
|---|---|
| 日常滚动 | 7—30份，默认14 |
| 重大操作恢复点 | 默认永久 |
| 手动命名快照 | 永久 |

流程：

```text
SQLite Online Backup
→ integrity_check
→ Hash
→ 标记已验证
→ 原子重命名
```

禁止：

- 直接复制打开中的数据库。
- 自动删除最后一份已验证备份。
- 恢复时覆盖原项目。

---

## 34. M4-05 UI 完整体验

必须实现：

- 新手/专业模式，数据共用。
- 自主/混合/AI初稿三路径。
- 对话式新建向导。
- 写作工作台三栏。
- 沉浸写作视图。
- 真实 AI 阶段进度。
- 上下文帮助。
- 低干扰锁定视觉。
- “安静编辑部”主题。
- 深色、护眼、高对比。
- 2K/曲面/超宽屏。
- 轻量里程碑，不做游戏化。

---

# 第六阶段：M5 发布硬化

## 35. 安全门

必须通过：

- Renderer 隔离。
- preload 白名单。
- CSP。
- IPC Schema 校验。
- 路径边界。
- DOCX 隔离。
- 密钥不落盘。
- 诊断包不含正文。

## 36. 数据门

必须通过：

- Migration 反复升级。
- WAL 异常恢复。
- 数据库损坏检测。
- 备份恢复。
- Candidate 冲突。
- 不可变 Version。
- 锁定块 0 破坏。

## 37. 性能门

| 指标 | 目标 |
|---|---:|
| 2K键入 P95 | ≤50ms |
| 自动保存 P95 | ≤150ms |
| 编辑 IPC P95 | ≤200ms |
| 取消 AI 反馈 | ≤500ms |
| 5000字 Diff 首屏 | ≤500ms |
| 5000字完整 Diff | ≤1.2s |
| 正文滚动 | ≥50fps |
| Core事件循环单次阻塞 | <100ms |

达到以下任一情况，启动“拆分 AI Utility Process”决策：

- AI期间编辑 IPC P95 持续 >200ms。
- 自动保存 P95 持续 >150ms。
- AI解析连续阻塞 >100ms。
- 取消请求 >500ms。
- 候选 Diff 持续掉帧。

## 38. 显示门

- 1280×800。
- 2K 100/125/150%。
- 21:9。
- 混合 DPI。
- 不模糊。
- 不截断。
- 无整页横向滚动。
- 危险操作不在超宽屏远端。

---

# AI 评测体系

## 39. 代码硬保证与模型质量分离

### 代码硬保证

必须为 0：

- 锁定块破坏。
- 未确认 Candidate 写入。
- Revision 冲突静默覆盖。
- AI 直接修改权威设定。
- 跨项目写入。

### 模型质量

按 Provider、模型、任务分别评测：

- T0 节拍覆盖。
- T0 因果成立。
- T1 骨架遵循。
- 状态提取准确率。
- 连续性问题精确率。
- 禁止信息泄露率。

支持级别：

```text
已验证
有限支持
未验证
```

---

## 40. Eval 目录

```text
evals/
├── fixtures/
│   ├── skeleton/
│   ├── chapter/
│   ├── rewrite/
│   ├── continuity/
│   ├── state-extract/
│   └── forbidden-information/
├── baselines/
│   └── <provider>/<model>/<task>.json
└── reports/
```

每次修改以下内容必须跑 Eval：

- Prompt。
- 约束包。
- 输出 Schema。
- Provider 适配器。
- FTS 排序。
- 状态提取规则。

---

# V1.5 实施门

## 41. 启动条件

V1.5 不能按日期自动启动，必须满足：

- V1.0 已稳定使用。
- 有真实长篇项目数据。
- FTS5 召回确实不足。
- 自动日记或分层记忆确实节省维护成本。
- Core 性能预算仍可控。

## 42. V1.5 Epic

- L0-L5 完整记忆调度。
- 时序状态历史账本。
- 热温冷自动分区。
- 卷级检查点。
- 定时 AI 项目日记。
- 300万—500万字压力适配。
- 条件性语义检索。

---

# Codex 提示词模板

## 43. 新功能实现

```text
阅读 AGENTS.md、V6.5设计文档第X章和 docs/tasks/<TASK>.md。

先不要编码。请：
1. 复述目标与非目标；
2. 列出影响的包、数据库表、IPC契约和测试；
3. 检查是否违反五项不变量；
4. 给出最小实施计划和回滚方式；
5. 标出需要我确认的决策。

计划确认后：
- 先写失败测试；
- 完成最小实现；
- 运行任务卡要求的全部检查；
- 自审数据安全、失败、取消和冲突路径；
- 输出证据报告，不要只说“已完成”。
```

## 44. Bug 修复

```text
复现并修复 <问题>。

要求：
1. 先建立稳定复现或失败测试；
2. 找到根因，不使用绕过或静默吞错；
3. 只修改必要范围；
4. 补充回归测试；
5. 运行受影响包的 lint/typecheck/test；
6. 说明修复为何不会破坏 Draft、Candidate、Version、锁定和 Revision 不变量。
```

## 45. 数据库任务

```text
实现 <Migration/Repository/事务>。

必须：
- 明确旧Schema和新Schema；
- Migration只追加，不修改已发布Migration；
- 使用事务；
- 定义失败和回滚保护；
- 测试空库、新库、旧库升级、升级中断；
- 不允许Renderer直接访问数据库；
- 输出SQL、索引、约束和性能影响。
```

## 46. UI 任务

```text
实现 <页面/交互>，依据V6.5视觉和交互规范。

必须验证：
- 新手与专业模式；
- 1280×800、2K 125%、21:9；
- 键盘操作和焦点顺序；
- 空、加载、失败、取消、冲突状态；
- 深色、护眼、高对比；
- 不使用大面积AI蓝底或成功绿色表达AI优劣；
- 附Playwright截图和验收步骤。
```

## 47. 安全审查

```text
只审查，不修改代码。

重点检查：
- Electron contextIsolation/sandbox/nodeIntegration；
- preload白名单；
- IPC输入校验；
- 路径穿越和跨项目访问；
- Credential和日志泄露；
- DOCX ZIP炸弹、宏、OLE、外链；
- Renderer是否获得Node或数据库能力；
- 备份与恢复是否覆盖原项目。

按严重度输出文件、行号、利用路径和修复建议。
```

## 48. 发布审查

```text
对当前分支做发布前审查，不修改代码。

依据：
- AGENTS.md
- V6.5 P0验收
- 本指南M5发布门

检查：
1. 功能闭环；
2. 数据不变量；
3. 安全；
4. 失败/取消/冲突；
5. 性能预算；
6. 2K/曲面/混合DPI；
7. 测试真实性；
8. 文档与实现一致性。

输出：
- 阻断问题；
- 高/中/低风险；
- 缺失证据；
- 是否允许合并/发布。
```

---

# 验收与证据

## 49. 每任务证据目录

```text
docs/test-evidence/<TASK-ID>/
├── summary.md
├── commands.txt
├── test-results/
├── screenshots/
├── performance.json
└── known-risks.md
```

## 50. 完成报告模板

```markdown
# <TASK-ID> 完成报告

## 结论
通过 / 未通过 / 部分通过

## 实现内容

## 未实现内容

## 修改文件

## 数据库与迁移

## IPC与契约

## 测试证据
| 命令 | 结果 | 耗时 |

## 手动验收

## 性能结果

## 安全检查

## 已知限制

## 后续任务
```

---

# Definition of Done

## 51. 通用 DoD

- [ ] 输入、输出、错误和权限边界明确。
- [ ] 无未批准生产依赖。
- [ ] TypeScript 严格模式无错误。
- [ ] 数据库变化含 Migration 和升级测试。
- [ ] IPC 变化同步更新 Schema、preload 和调用端。
- [ ] 关键路径有自动化测试。
- [ ] 失败、取消和冲突有用户可理解反馈。
- [ ] 不记录正文、Prompt 和密钥。
- [ ] Renderer 无法绕过 Core。
- [ ] 运行了要求命令并保存证据。
- [ ] 文档与实现一致。
- [ ] 无 TODO、假数据、空实现冒充完成。

## 52. 高风险 DoD

以下修改需要第二轮独立审查：

- Migration。
- Draft Patch。
- LockGuard。
- Candidate 接受。
- Version 创建。
- 状态回写。
- 备份恢复。
- 密钥。
- 路径和文件删除。
- Electron 安全配置。

---

# 发布检查清单

## 53. V1.0发布前

### 构建

- [ ] Windows 安装包可安装和卸载。
- [ ] macOS 签名/公证流程通过。
- [ ] Linux 目标格式可运行。
- [ ] 原生模块与 Electron ABI 匹配。

### 安全

- [ ] SEC-01/02。
- [ ] IPC 白名单。
- [ ] CSP。
- [ ] 密钥不落盘。
- [ ] DOCX 隔离。

### 数据

- [ ] DB-01/02。
- [ ] Migration。
- [ ] 三轨备份。
- [ ] 新目录恢复。
- [ ] FTS 重建。

### AI

- [ ] AI-01。
- [ ] 模型支持级别。
- [ ] T0/T1 Eval。
- [ ] 取消和 partial Candidate。

### UI

- [ ] 1280×800。
- [ ] 2K 100/125/150%。
- [ ] 21:9。
- [ ] 混合 DPI。
- [ ] 深色/护眼/高对比。
- [ ] 键盘和焦点。

### 性能

- [ ] PERF-01/02。
- [ ] 无持续事件循环阻塞。
- [ ] 长章节编辑和 Diff。

---

# Codex 反过度设计规则

## 54. 任何新增抽象前必须回答

1. 当前已有哪个真实任务无法完成？
2. 已出现几次重复实现？
3. 最小直接实现为什么不足？
4. 新抽象会增加哪些接口和测试？
5. 如果未来需求不出现，是否成为负担？

以下理由不成立：

- “以后可能支持更多 Provider。”
- “以后可能做插件。”
- “先把接口留好。”
- “行业一般都这么做。”
- “方便未来扩展。”

---

# 最终执行顺序

```text
M0 工程、安全、数据库、IPC、高分屏Spike
→ M0.5 AI质量与中文Diff原型
→ M1 项目、编辑、锁定、版本
→ M2 规划、设定、连续性
→ M3 Provider、T0/T1、Candidate
→ M4 校验、搜索、导入导出、备份、完整UI
→ M5 安全/性能/跨平台发布硬化
→ V1.0发布
→ 真实作者使用与长篇数据收集
→ V1.5独立立项
```

> 判断开发是否成功的唯一标准不是代码量，而是：作者能否在本地安全、顺畅地写作；AI是否始终作为可拒绝、可撤销、可追溯的候选；所有完成结论是否有真实测试和验收证据。
