# M9-03 Writing临时覆盖排除治理

## 1. 原则

覆盖率排除不得用于隐藏可直接执行的业务逻辑。纯函数、请求编排、写操作和异步刷新控制器必须进入常规覆盖统计。

本检查点已将以下文件重新纳入统计，并提供直接单元测试：

- `generation-task-subscription.ts`
- `use-generation-run-actions.ts`

其余排除仅限当前Node测试环境无法忠实执行的React或浏览器DOM生命周期适配层。每项必须同时满足：

1. 核心算法已下沉到可单测模块，或已有源码不变量测试；
2. 真实挂载、卸载、IME、Selection或DOM行为由Electron E2E验证；
3. 后续引入受控React/DOM测试环境时撤销排除；
4. 不得新增同类排除，新增需求必须先补测试架构。

## 2. 临时排除清单

| 文件 | 当前排除原因 | 替代证据 | 退出条件 |
|---|---|---|---|
| `editor-selection.ts` | 依赖DOM Selection、Node路径和编辑器真实DOM | `writing-tools.test.ts`覆盖纯范围算法；Electron E2E覆盖编辑器选择恢复 | 建立可控DOM Selection测试夹具后撤销 |
| `paste-sanitizer.ts` | 依赖DOMParser、HTMLElement、XMLSerializer | `writing-tools.test.ts`覆盖隐藏样式判定；Electron E2E覆盖粘贴清理 | Node测试引入受控DOM实现后撤销 |
| `review-diff-panel.tsx` | React DOM渲染与交互组件 | Candidate Electron E2E与源码结构测试 | 建立Renderer组件测试夹具后撤销 |
| `use-chapter-session.ts` | React状态与异步章节切换生命周期 | `chapter-session-state.test.ts`、AR-04定向回归、Electron E2E | 建立Hook挂载与章节切换竞态测试后撤销 |
| `use-draft-autosave.ts` | React Effect、计时器与编辑器生命周期组合 | Autosave协议单测、AR-04定向回归、Windows IME与Electron E2E | 建立Hook计时与Unmount测试后撤销 |
| `use-editor-lifecycle.ts` | 编辑器真实挂载、销毁、Selection和IME组合 | Editor源码不变量、Windows原生拼音、Electron E2E | 建立Editor生命周期测试壳后撤销 |
| `use-generation-sources.ts` | React Effect装载Provider和SceneBeat | Generation启动行为矩阵、Electron E2E | 将加载编排下沉为纯控制器并补测后撤销 |
| `use-writing-continuation.ts` | React状态与编辑器续写恢复组合 | Continuation纯工具与请求协调单测、Electron E2E | 建立Hook竞态测试后撤销 |
| `use-writing-editor-tools.ts` | 编辑器实例、DOM事件和React回调组合 | Writing纯工具、编辑器工具单测、Electron E2E | 将非DOM编排继续下沉并补测后撤销 |
| `use-writing-metrics.ts` | React状态与编辑器实例读取组合 | `calculateWritingStatistics`与锁定判定既有单测、Electron E2E | 建立Hook状态刷新测试后撤销 |
| `use-writing-session-controller.ts` | 多Hook组合根，不承载独立算法 | 各子模块测试、AR-04架构不变量、Electron E2E | 子Hook直接覆盖完成后撤销 |
| `use-writing-status.ts` | React状态派生与回调生命周期 | 状态文案源码不变量与Electron E2E | 将状态派生提取为纯函数并补测后撤销 |

## 3. 当前整改闭环

- Candidate文档加载增加独立请求代次，旧请求不得回写新选择。
- 候选切换主动废弃并取消旧Preview。
- 只读会话在操作函数和按钮入口双重阻断丢弃写请求。
- Generation刷新改为显式Promise契约并实施单飞保护。
- Candidate乱序、只读写入、Generation单飞与异常路径均新增行为测试。

## 4. 后续约束

AR-05开始前必须确认最新Head的Static、Unit、Coverage、Build和Electron E2E全部通过。若重新纳入统计的文件导致Coverage失败，应补测试或修复实现，不得重新加入排除清单。
