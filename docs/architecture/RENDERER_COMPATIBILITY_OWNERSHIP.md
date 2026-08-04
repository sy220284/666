# Renderer旧兼容面退役记录

## 当前结论

M3-10已经完成旧命令式Renderer退役。M10-04删除最后的空载Legacy Loader、空所有权清单及`legacy-compatibility`启动阶段；当前Renderer只有React入口和明确的生命周期注册表。

## 已退役对象

- 旧`main.ts`与`entry.ts`启动入口。
- Candidate Preview与Candidate Apply旧Bootstrap/UI模块。
- 旧Canon、Planning、Continuity、Scene Beat工具直连模块。
- `#legacy-root`、旧CSS入口及兼容DOM所有权。
- `compat/legacy-loader.ts`与`compat/legacy-ownership.ts`。

## 当前强制边界

1. Renderer只能通过`src/bridge/`中的受控Adapter访问Preload Bridge。
2. React组件不得直接读取`window.worldforge`、Node、文件系统、SQLite、环境变量或凭据。
3. 事件监听、请求取消器、编辑器与Autosave资源必须登记到`RendererLifecycleRegistry`。
4. 旧入口和兼容文件重新出现时，结构测试必须失败。
5. CSS层固定为`base、layout、components、themes`，不得重新引入`#legacy-root`选择器。

## 验证

`tests/unit/renderer-startup-compatibility.test.ts`维护退役文件清单并验证旧模块不存在；Renderer Foundation测试验证并发启动单飞、Core健康门禁和资源幂等清理。
