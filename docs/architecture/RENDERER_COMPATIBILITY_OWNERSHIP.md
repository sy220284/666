# Renderer兼容面所有权与退出协议

## 当前入口

M3-07期间，旧Renderer通过单一兼容加载器初始化一次。仍直接读取Preload Bridge的旧模块及资源所有权由`legacy-ownership.ts`登记，新增React代码不得直接接管旧DOM节点或读取`window.worldforge`。

## 所有权边界

| 旧模块 | 所有者 | 主要资源 | 退出任务 |
| --- | --- | --- | --- |
| `index.ts` | legacy-shell-and-writing | 全局事件、计时器、异步请求、Tiptap、Autosave、业务DOM | M3-10 |
| Candidate两个Bootstrap及两个UI模块 | legacy-candidate-* | 事件、请求、Candidate DOM | M3-10 |
| `canon-ui.ts` | legacy-canon | 事件、请求、Canon DOM | M3-09 |
| continuity/narrative/state-proposal | legacy planning owners | 事件、请求、规划与连续性DOM | M3-09 |
| scene-beat selector/trash guard | legacy data-tool owners | 事件、请求、数据工具DOM | M3-09 |

当前登记共11个仍直接读取Preload Bridge的Legacy模块。Bridge安全边界只允许`src/bridge/`和该显式清单继续直连；新文件未登记即失败。

## 注销协议

1. 每个迁移域建立唯一owner标识。
2. 事件监听、计时器、请求取消器、编辑器销毁和Autosave刷新函数必须注册到生命周期注册表。
3. 项目切换、窗口关闭或兼容面卸载时按owner执行一次清理。
4. 清理函数必须幂等；单个清理失败不得阻止其余资源释放。
5. React接管某一域前，先完成旧owner清理，再挂载新组件。
6. M3-10删除旧入口前，所有清单项必须有对应迁移任务和验证结果。
