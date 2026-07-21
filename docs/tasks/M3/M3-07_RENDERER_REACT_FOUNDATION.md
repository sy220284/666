# M3-07 Renderer React运行底座与兼容迁移入口（重做版）

> 状态：In Progress  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 实施代次：V2  
> 机器分支：`work/m3-07-renderer-react-foundation`  
> 重做基线：本任务卡合并后的最新`main`提交

## 一、作废声明

以下内容全部作废，不得作为实现、测试、Evidence或后续提交来源：

- PR #109、PR #116、PR #118；
- 旧分支`work/m3-07-renderer-react-foundation`此前产生的全部未合并提交；
- 为旧方案建立的任务专属、一次性或分支专属Workflow；
- 旧方案中的隐藏式React占位根、Workflow生成锁文件、Workflow生成正式代码和自动写Evidence路径；
- 从上述提交进行cherry-pick、复制后伪装为新实现或沿用旧测试结论。

规范机器分支已恢复到主线基线。本任务只能从本卡合并后的最新main重新建立该分支并实施V2方案。

## 二、目标

在不迁移现有业务页面、不改变Core与IPC语义的前提下，建立可重复构建、可测试、可逐域迁移的React Renderer运行底座：

1. React成为Renderer新增代码的唯一组件运行时；
2. 当前命令式Renderer继续作为明确标记的兼容面运行；
3. 新React代码统一经过具名Bridge适配层访问Preload；
4. Zustand只承载临时UI状态，不保存业务权威对象；
5. 建立状态优先级、错误边界、请求取消和陈旧响应丢弃基础；
6. 为M3-08—M3-10提供稳定迁移接口，当前业务行为保持等价。

## 三、阶段边界

```text
M3-07
├─ 建立React/ReactDOM/Zustand依赖与构建入口
├─ 建立React Root、错误边界和状态出口
├─ 建立Bridge适配层和请求生命周期
├─ 建立临时UI Store
├─ 建立旧Renderer兼容加载边界
└─ 证明现有业务路径无退化

M3-08
└─ 迁移壳层、首页、项目与设置

M3-09
└─ 迁移规划、设定、结构与数据工具

M3-10
└─ 迁移写作、Version、Candidate并删除旧入口
```

## 四、非目标

- 不迁移首页、项目、设置、规划、设定、结构、写作、Version或Candidate页面。
- 不删除旧`index.ts`、旧业务HTML或既有bootstrap文件。
- 不修改Core Use Case、Repository、Migration、数据库表、Preload白名单或IPC命令语义。
- 不将Project、Draft、Candidate、Version、Entity、Canon、EntityState或任务快照保存到Zustand。
- 不在本任务完成视觉重设计、完整AppShell或M7主题成品。
- 不要求一次性清除旧Renderer内全部`window.worldforge`调用；只禁止新React目录继续新增直调。
- 不建立新的任务专属Workflow、依赖锁同步服务或自动生成正式文件的CI工具。

## 五、依赖

- M3-06已Implemented；
- M3-06有限期状态缺陷已由`01409dd483191764fbc05d5bb298a33f5b32f360`修复；
- M3→M4阶段硬门已进入main；
- 本任务无需等待任何未合并治理PR。

## 六、必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/ui/UI_SYSTEM.md`
- `docs/ui/ACCESSIBILITY.md`

## 七、主要影响范围

- `apps/desktop/renderer/`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tests/unit/`
- `tests/security/`
- `tests/e2e/`
- `docs/architecture/`
- `docs/ui/`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `docs/test-evidence/M3-07/`

## 八、实施顺序

### A. 依赖与构建基线

1. 使用正常开发环境执行pnpm命令，引入精确版本的React、ReactDOM、Zustand及类型依赖。
2. 提交由pnpm生成的规范`pnpm-lock.yaml`；禁止手工拼接锁文件，禁止由任务Workflow生成锁文件。
3. Renderer TypeScript配置正式支持TSX。
4. 构建入口改为明确的React入口文件；生产构建、类型声明和Electron加载路径保持一致。
5. 从干净工作树执行`pnpm install --frozen-lockfile`必须成功。

### B. React运行入口

1. 建立`react-entry.tsx`和唯一React Root。
2. React Root必须实际参与Renderer启动，不得通过1像素、裁剪、`display:none`或纯测试标记伪装完成。
3. Root只承载基础错误边界、状态出口和兼容面装载器，不接管尚未迁移的业务节点。
4. React初始化失败时显示可诊断的P0错误，同时保留安全关闭与复制诊断信息能力。

### C. Bridge适配层

1. 新建`bridge/`目录作为新React代码访问Preload的唯一入口。
2. 适配层必须保留合同返回的错误码、`diagnosticId`、`retryable`和`userAction`，不得只转换为普通字符串异常。
3. 提供统一请求状态：`idle`、`pending`、`success`、`failure`、`cancelled`、`stale`。
4. 支持`AbortSignal`取消、同键重复提交阻断和最新请求代次校验。
5. 旧Renderer直调暂时允许，但必须记录在兼容清单中；M3-08—M3-10逐域清除。

### D. Zustand临时状态边界

Store只允许保存：

- 一级路由标识；
- 当前选择的项目ID、卷ID、章节ID和实体ID；
- Drawer、Dialog、Popover开关；
- 返回位置和临时筛选条件；
- 当前前台请求键及短时反馈标识。

Store禁止保存：

- 完整Project、Draft、Candidate、Version、Entity或EntityState对象；
- 正文内容、Revision、Hash、锁定状态真值；
- Core任务结果缓存或可作为提交基线的业务副本；
- `localStorage`、IndexedDB或其他持久化镜像。

### E. 状态与生命周期

1. 建立P0—P3状态仲裁：
   - P0：安全、只读、恢复、数据完整性和Core不可用；
   - P1：阻断当前操作的冲突或失败；
   - P2：长任务、保存、同步和上下文状态；
   - P3：短时成功反馈。
2. 同级状态按持久性、时间和明确替换关系仲裁，禁止Toast覆盖P0/P1。
3. 建立兼容加载器，保证旧Renderer只初始化一次。
4. 记录旧入口的事件监听、计时器、异步请求、Tiptap和Autosave所有权清单。
5. 本任务只建立注销协议和注册表；真正删除旧业务监听与入口由对应迁移任务完成。
6. 关闭窗口、切换项目和重载前不得新增重复保存、重复监听或幽灵请求。

### F. 静态边界

新增机器检查至少覆盖：

- `app/`、`features/`、`state/`和通用React组件不得出现`window.worldforge`；
- React组件不得使用`document.querySelector`、`innerHTML`控制业务DOM；
- Zustand Store不得出现业务权威类型或持久化中间件；
- 新代码不得增加内联样式选择不同业务命令；
- 旧目录例外必须使用显式白名单，不能把整个Renderer目录排除扫描。

## 九、测试要求

### Unit

- Bridge成功、失败、安全错误信息保留；
- 取消、重复提交和陈旧响应丢弃；
- P0—P3仲裁；
- Store字段白名单与业务对象禁入；
- 兼容加载器单实例。

### Security

- 新React目录无Preload全局直调；
- 无业务DOM注入和`innerHTML`；
- 无业务数据持久化；
- CSP下React生产Bundle可加载。

### Electron E2E

至少覆盖：

1. 应用启动并确认React Root真实挂载；
2. Core状态从启动进入健康或明确失败状态；
3. 新建或打开项目；
4. 进入正文；
5. 修改并保存正文；
6. 关闭项目或应用；
7. 全过程旧业务路径保持可用，无双实例和重复保存。

### 全量回归

必须执行活动任务规定的Lint、Typecheck、Unit、Integration、Migration、Security、Build、Electron E2E和Eval门禁。旧测试失败不得以“尚未迁移”跳过。

## 十、Evidence

只使用仓库正式四文件证据包：

- `summary.md`
- `commands.txt`
- `known-risks.md`
- `manifest.json`

要求：

- 命令和结果来自真实运行；
- 人工复核结论写入`summary.md`；
- Manifest绑定实际实现提交；
- 不创建任务专属Workflow或临时测试来生成Evidence；
- 截图、完整日志和独立矩阵仅在实际风险需要时增加。

## 十一、完成条件

同时满足以下条件，M3-07才可登记Implemented：

1. 规范工作分支从本任务卡合并后的最新main重新建立，PR差异不含旧PR提交；
2. React依赖、TSX、构建入口和锁文件可复现；
3. React Root真实启动，旧Renderer通过单一兼容入口加载；
4. 新React代码只通过Bridge适配层访问Preload；
5. Zustand只含临时UI状态；
6. 状态仲裁、错误边界、取消和陈旧响应保护有测试；
7. 现有项目、正文、保存和关闭路径无行为退化；
8. 无任务专属或一次性Workflow；
9. 全套PR门禁成功；
10. Evidence完整，`taskctl advance`原子激活M3-08。

任一条件未满足，不得声明完成、不得转Ready、不得激活M3-08。
