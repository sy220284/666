# M0 任务卡：工程、安全与关键技术验证

## M0-01 Monorepo与质量工具

- 目标：建立可安装、可构建、可测试的最小工程。
- 依赖：无。
- 分支：`feat/m0-monorepo-foundation`
- 关联：REQ-001，P0-001。

### 实现

- pnpm workspace。
- `apps/desktop/{main,preload,renderer}`。
- `packages/{contracts,domain,core-service,editor-core,prompts,testkit}`。
- TypeScript strict、ESLint、Prettier、Vitest、Playwright。
- 根脚本：`dev/build/lint/typecheck/test/test:integration/test:e2e/test:security/test:migration/test:perf/test:eval`。
- 最小Electron窗口和空白Core启动。

### 非目标

不实现业务页面、数据库Schema和Provider。

### 验收

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

所有命令通过；包依赖方向符合AGENTS。

---

## M0-02 Electron安全基线

- 目标：冻结Main/Preload/Renderer安全边界。
- 依赖：M0-01。
- 分支：`feat/m0-electron-security`
- 关联：REQ-001、024、042，P0-002—005、067—069。

### 实现

- `nodeIntegration:false`、`contextIsolation:true`、`sandbox:true`、`webSecurity:true`。
- 严格CSP。
- 具名Preload白名单和Zod输入校验。
- 禁止应用内远程导航和新窗口；外链系统浏览器打开。
- 正式版DevTools策略。
- OS Credential Store最小Spike；数据库只存`credentialRef`。
- 安全日志字段白名单。

### 测试

- Renderer访问Node、文件、环境变量失败。
- 未注册IPC、额外字段和非法枚举被拒绝。
- 远程链接不能在应用窗口内加载。
- 凭据不进入日志和Renderer状态。

### 退出条件

P0-002—005与P0-067—069对应自动化测试通过。

---

## M0-03 SQLite、Migration与单写队列

- 目标：建立唯一数据真源和可靠写入底座。
- 依赖：M0-01。
- 分支：`feat/m0-sqlite-write-queue`
- 关联：REQ-005、006，P0-006、007、012。

### 实现

- better-sqlite3基础封装。
- `app.sqlite`和`project.sqlite`连接类型。
- WAL、外键、busy_timeout和synchronous初始化。
- 串行写队列和只读查询通道。
- Migration Runner、`schema_migrations`和checksum。
- `quick_check`、`integrity_check`和`foreign_key_check`接口。
- 故障注入点。

### 非目标

只建立基础表和Migration框架，不一次实现所有业务表。

### 测试

- 100轮并发提交无丢写。
- 重复requestId不重复写入。
- 事务中断回滚。
- checksum异常与高版本Schema安全处理。

---

## M0-04 IPC与流式事件协议

- 目标：打通安全命令和长任务事件通道。
- 依赖：M0-01、M0-02。
- 分支：`feat/m0-ipc-streaming`
- 关联：REQ-028，P0-003、023、024。

### 实现

- CommandEnvelope、Success/Failure Schema。
- Preload白名单生成或注册机制。
- MessagePort AI事件：started/stage/delta/usage/completed/cancelled/failed。
- 20—50ms批量增量、sequence、缺号快照和背压。
- `task.getSnapshot`和取消命令。
- 标准错误码映射。

### 测试

- 乱序、重复、缺号、慢Renderer和多任务并行。
- 切换页面不取消、不串任务。
- 取消反馈目标≤500ms。

---

## M0-05 2K、曲面屏与窗口恢复Spike

- 目标：在正式页面开发前验证显示策略。
- 依赖：M0-01。
- 分支：`feat/m0-display-scaling-spike`
- 关联：REQ-041，P0-063—066。

### 实现

- DIP窗口坐标、displayId和scaleFactor保存。
- 680/760/860 CSS px正文版心。
- UI缩放与正文字号独立。
- `<1100px`右抽屉、`<900px`双抽屉。
- 21:9居中/偏左/偏右工作区原型。
- 双栏、上下和单稿候选布局占位原型。

### 验收环境

1280×800；2560×1440的100/125/150%；3440×1440；3840×1600；混合DPI双屏。

### 退出条件

无整页横向滚动；文字和SVG清晰；危险操作靠近内容区；窗口跨屏可恢复。

---

## M0-06 AI质量与中文Diff Spike

- 目标：在建设完整AI产品前验证两项最高风险。
- 依赖：M0-03、M0-04。
- 分支：`feat/m0-ai-diff-spike`
- 关联：REQ-026、029、030，P0-025、026、029。

### 实现

- Provider Stub：正常流、断流、无效JSON、超时和取消。
- T0结构化Schema与最小Prompt。
- T1骨架遵循Fixture。
- `logicalBlockId`结构Diff。
- 中文字符Diff，覆盖拆分、合并、新增、删除和长段落。
- 最小Eval报告和ModelSupportProfile格式。

### 性能

5000字Diff首屏≤500ms，完整≤1.2s；测试记录机器和样本。

### 决策输出

- T0/T1是否可继续作为V1可选路径。
- Diff算法是否需要Worker或分片。
- 不通过时明确替代方案，不用UI绕过。
