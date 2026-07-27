# C1 作者工作流检查点

## 交付结论

C1的新增纵向能力已经落到产品代码：

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

- 第二轮产品复核提交：`4f78143ca933a7e57326e32e3e86285d0bfc95c3`。
- 当前C1收口源提交：`ea7463a40faa5b23b3b9afc97504be19f2cee708`。
- 修复继续写作只校验锚点块Hash、未比较保存Revision的问题。
- 新增“其他正文块变化、锚点块不变”回归，要求继续写作状态仍判为`stale`。
- 保留锚点块自身变化时的精确`block-changed`原因。
- 面板切换保存只在Core确认成功后提交去重签名；失败或被替代的请求不污染已确认状态，同一状态保持可重提，并通过既有防抖保存路径做一次有界重试。
- 上述面板协调修复属于C1收口，不代表C8已经启动。

## 历史阶段验证

- ESLint：新增与受影响代码通过。
- TypeScript：全工作区通过。
- Unit、Integration、Migration：120个文件、630项全部通过。
- Build：全工作区通过。
- Electron SQLite运行时：通过。
- 早期Electron Playwright曾因容器缺少X Server在Renderer启动前退出；该历史环境问题已经由后续完整Quality运行中的Electron E2E成功结果取代。

## 当前验证结论

最近一次完整产品矩阵为提交`f36ca0c0567130ab7072c6da3d0ed402dd1fda2d`上的GitHub Actions Quality #2186，Static、Unit、Integration、Migration、Coverage、Build、Package Smoke与Electron E2E全部成功。Security #1976、Performance #1942及其余永久治理门也全部成功。

当前C1源提交`ea7463a`在上述完整矩阵后新增面板切换持久化修复，已完成Prettier、ESLint、TypeScript、Boundary和Unit 490/490定向验证；尚无该提交对应的新一轮完整GitHub Actions运行，因此不把它描述为“最新Head全量CI已通过”。

## 后续入口

C2从Schema 23开始实现GenerationRun、生产Prompt、ModelSupportProfile和TaskProtocol结果引用。Schema 22及继续写作合同保持向后兼容，不在后续检查点重建。
