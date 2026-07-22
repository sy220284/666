# M3-08 React运行底座、Renderer壳层、首页、项目与设置迁移

权威实现提交：`a519fc5fedac59777ed8c9d683a15d4b8a715f3e`

代码承载Quality运行：`29885074542`。Static、Unit、Integration、Migration、Build与Electron E2E全部成功，桌面场景`19/19`通过；独立门Security `29885074405`、Performance `29885074413`和PR Policy `29885074409`均成功。

## M3-07转入范围完成情况

| 转入要求 | 完成结果 |
| --- | --- |
| React、ReactDOM、Zustand及类型依赖 | 精确安装React/ReactDOM `19.2.8`、Zustand `5.0.14`、`@types/react` `19.2.17`、`@types/react-dom` `19.2.3`。 |
| pnpm规范锁文件 | 使用pnpm `11.13.0`生成并以冻结锁文件安装成功。 |
| TSX与唯一真实入口 | Renderer启用`react-jsx`，由`react-entry.tsx`和`createRoot`挂载唯一可见Root。 |
| Bridge、Runtime与错误边界 | 真实入口接入具名Bridge Adapter、请求生命周期、状态仲裁、兼容加载器和启动Runtime；P0诊断保留错误码、诊断ID、可重试性、用户动作与安全details。 |
| Zustand临时状态边界 | Store只保存路由、选择与前台请求等临时UI状态，不使用持久化中间件，也不接收业务权威对象。 |
| React与Legacy所有权隔离 | React独占壳层、首页、项目生命周期和设置DOM；未迁移业务由单实例兼容层承载，两者不控制同一节点。 |
| Preload访问边界 | 新React代码只通过具名Adapter访问Preload，没有新增`window.worldforge`直调。 |
| 完整复验与证据 | Unit、Integration、Migration、Security、Performance、Eval、Build、Electron E2E与Package均取得成功退出码，四文件证据包已生成。 |

## M3-08交付结果

- React实现AppShell、TopBar、六个一级入口、响应式Sidebar/Drawer、TaskBar与安全Banner。
- React迁移首页、最近项目、项目健康状态、新建/打开/关闭/移动/重新定位、Core状态/重启，以及通用、编辑器、外观和高级设置。
- 设置写入采用串行确认快照，进入设置不再启动可覆盖新值的陈旧读取；重启后默认模式、主题、变体和减少动态效果均由`app.sqlite`恢复。
- 写作、Version、Candidate、规划、设定、恢复和导入导出等未迁移业务继续由单一兼容面可达；离开、关闭和移动项目前保留Draft刷新保护。
- Electron验收覆盖启动、真实React Root、Core、项目与设置持久化、正文可达和保存、关闭与恢复，以及1280×800、2K 125%和21:9显示矩阵。

人工复核确认：可见壳层不存在隐藏占位Root或双重DOM控制；设置竞态的数据库回读与重启恢复断言均通过；远端显示矩阵截图和完整日志已由Quality运行留存。

结论：M3-08实现和M3-07全部转入代码范围已完成，任务已登记为Implemented并激活M3-09；M3批次关闭时再依据本证据执行阶段复验与转入任务闭环。
