# C1 作者工作流检查点

## 交付结论

C1 的新增纵向能力已经落到产品代码：

- Project Schema 22新增严格的`project_settings`，只保存继续写作锚点，不复制正文。
- 继续写作锚点包含章节、草稿修订、逻辑块、块哈希、块内光标、滚动位置和工作面板。
- Core读取锚点时重新核验活动章节、活动Draft、当前Draft Revision、逻辑块Hash和光标范围；失效位置返回安全回退状态。
- Main、Preload、Renderer使用显式命名合同与白名单通道，跨项目和只读写入继续由Workspace边界阻断。
- 首页显示上次章节并提供单击续写；最近项目首项也可直接续写。
- 编辑器在自动保存、切章、切工作台和关闭项目前刷新锚点，重启后恢复有效块内位置。
- 写作工作台加入卷章目录、上下文侧栏独立折叠和沉浸写作状态。
- 人物与世界条目使用中文类型选项；拆章、并章、跨章移动继续复用既有可视化影响预览、`planHash`、锁定保护、事务与恢复点。

## 数据与隐私边界

`project_settings.value_json`只包含定位元数据。正文、Prompt、凭据、原始Provider响应和用户选择文本均不会进入继续写作设置。锚点与活动项目ID不一致时返回空结果；锚点块变化返回`block-changed`，锚点块未变但Draft Revision已变化返回`draft-changed`，Renderer据此安全回退。

## C0—C7复核修复

- 受检产品提交：`4f78143ca933a7e57326e32e3e86285d0bfc95c3`。
- 修复继续写作只校验锚点块Hash、未比较保存Revision的问题。
- 新增“其他正文块变化、锚点块不变”回归，要求继续写作状态仍判为`stale`。
- 保留锚点块自身变化时的精确`block-changed`原因。

## 历史阶段验证

- ESLint：新增与受影响代码通过。
- TypeScript：全工作区通过。
- Unit、Integration、Migration：120个文件、630项全部通过。
- Build：全工作区通过。
- Electron SQLite运行时：通过。
- Electron Playwright：当时容器缺少X Server，进程在Renderer启动前退出；该项继续由C8显示环境复核。

## 当前Head验证边界

GitHub Actions Quality #2054已通过任务镜像、Workspaces、Boundary、Prettier、ESLint、Typecheck与干净工作树检查。PR保持Draft，新增继续写作集成回归尚未由Ready全量测试路由执行，不冒充当前Head的新通过结论。

## 后续入口

C2从Schema 23开始实现GenerationRun、生产Prompt、ModelSupportProfile和TaskProtocol结果引用。Schema 22及继续写作合同保持向后兼容，不在后续检查点重建。
