# AR-07 AppShell拆分验证与回退记录

## 1. 检查点

- 任务：M9-03 / AR-07
- PR：#273
- 基线main：`7adafeeadb973e5cb035c301602c511c2aa065c5`
- 前置检查点：AR-06受检Head `99f124369054ab20dcf919ec89aacfd41f592152`
- AR-07受检实现Head：`18558ef8088cac6553609b0ffd3c5f3abe52468c`
- Quality Run：`30701615058`
- 结果：AR-07实现与完整Draft质量矩阵通过。

## 2. 结构结果

AR-07前，`app-shell-m3.tsx`同时承担应用启动、最近项目恢复、项目会话、设置持久化、Workspace Attention、任务订阅、导航守卫、全局状态推导、页面选择与布局装配。AR-07完成后：

```text
app-shell-m3.tsx（组合根，结束于约300行）
├─ app-shell-helpers.ts
├─ app-shell-status.ts
├─ app-shell-pages.tsx
├─ app-shell-layout.tsx
├─ use-workspace-startup.ts
├─ use-project-session-controller.ts
├─ use-app-settings-persistence.ts
├─ use-workspace-runtime.ts
│  ├─ Core状态
│  ├─ Task订阅与刷新
│  └─ Workspace Attention请求代次
├─ use-app-shell-navigation.ts
│  ├─ 主导航
│  ├─ 作者目标导航
│  ├─ 返回来源
│  └─ Writing Flush导航守卫
└─ use-app-shell-actions.ts
```

组合根只保留控制器装配、少量跨控制器协调和布局组合；页面选择、状态模型及布局均已迁出。冻结工作包中的职责已按等价模块落实，命名服从现有Renderer语义，没有新增第二套导航、任务或项目会话控制器。

## 3. 行为与权威边界

- `reopen-last`继续由启动控制器读取最近项目并走既有Bridge打开路径。
- 项目切换、关闭、恢复和刷新继续通过同一项目会话控制器协调。
- Workspace Attention使用独立请求代次；项目、路由或任务变化后，旧响应不得回写当前项目。
- Task MessagePort订阅仍只触发活动任务刷新，没有改变任务协议与事件语义。
- 离开Writing、跳转作者目标及返回来源前继续执行统一Draft Flush；失败时阻止导航并保留中文提示。
- 设置读取、保存、重置和Provider状态更新迁入设置控制器，保持串行写入、失败回滚与已确认设置语义。
- 全局状态继续按P0、P1、P2、P3优先级推导，首页健康信号和动作入口保持兼容。
- 首页、设置、工作台页面选择与布局迁入独立组件，公开Props、中文文案和`data-*`测试标记保持兼容。
- 数据库Schema、历史Migration、IPC Channel、协议版本、错误码和公开Bridge方法均未修改。

## 4. 自动验证

受检Head `18558ef8088cac6553609b0ffd3c5f3abe52468c`：

```text
Evidence             PASS
Task Governance      PASS
PR Policy            PASS
Security             PASS
Performance          PASS
Format               PASS
Lint                 PASS
Typecheck            PASS
Unit                 PASS
Integration          PASS
Migration            PASS
Coverage             PASS
Build                PASS
Electron E2E         PASS
Quality aggregate    PASS
```

Coverage：

```text
测试文件     227 / 227通过
测试数量     1009 / 1009通过
Statements   85.12%
Branches     75.34%
Functions    84.74%
Lines        86.93%
```

新增和更新的专项验证覆盖：

- `ar07-app-shell-boundaries.test.ts`：组合根预算、职责迁出和模块边界。
- `app-shell-runtime-models.test.ts`：路由错误转换、首页健康信号、P0—P3状态优先级。
- `app-shell-capability-actions.test.ts`：能力动作与Core重启顺序。
- `renderer-react-runtime-root.test.ts`：React运行时根与新AppShell装配。
- `m8-09-v1-stability-invariants.test.ts`：V1稳定性断言迁移到新边界。

六个React/DOM生命周期控制器在Node覆盖环境中无法可靠执行，按仓库既有具名排除策略处理；排除仅限精确文件，不降低75%阈值。纯逻辑`app-shell-helpers.ts`与`app-shell-status.ts`继续纳入覆盖统计。退出条件是仓库引入可忠实执行React、DOM、MessagePort和Electron生命周期的覆盖环境后，逐项移除这些具名排除；在此之前由行为测试、源码不变量与Electron E2E共同提供替代证据。

本次Draft路由未执行Windows原生拼音Job。AR-07未修改Writing Editor、IME状态机或草稿保存协议；相关Windows验收由已合并AR-04检查点和最终Ready全矩阵承担。

## 5. 回退

AR-07未改变持久化格式、协议或公开Bridge，可按模块边界回退：

1. 将`app-shell-m3.tsx`恢复到AR-06检查点；
2. 删除AR-07新增的AppShell布局、页面、状态、辅助模块和六个生命周期控制器；
3. 恢复AR-07调整的稳定性测试与覆盖配置；
4. 删除AR-07专项测试；
5. 重新运行Static、Unit、Integration、Migration、Coverage、Build和Electron E2E。

若发现P0行为回归，应整体回退AR-07到`99f124369054ab20dcf919ec89aacfd41f592152`，不得在AR-08 Contracts拆分中追补AppShell缺陷。

## 6. 结论

AR-07满足冻结工作包要求，可以将M9-03活动检查点切换至AR-08。PR #273继续保持Draft；AR-05—AR-14全部完成前不得转Ready或合并。
