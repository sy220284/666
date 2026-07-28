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

- 修复继续写作只校验锚点块Hash、未比较保存Revision的问题。
- 新增“其他正文块变化、锚点块不变”回归，要求继续写作状态仍判为`stale`。
- 保留锚点块自身变化时的精确`block-changed`原因。
- 面板切换保存只在Core确认成功后提交去重签名；失败或被替代的请求不污染已确认状态，同一状态保持可重提，并通过既有防抖保存路径做一次有界重试。
- 上述面板协调修复属于C1收口，不代表C8已经启动。

## C1后续并发硬化

产品代码提交：`0987f2237911289f6d91f94498b3278cc82628ed`。

- 同一项目的继续写作请求使用单通道串行执行；执行期间只保留最新待处理状态，中间状态以`stale`收口。
- 不同项目使用独立通道，不发生跨项目阻塞。
- 迟到成功、旧面板失败重试和旧Renderer闭包不得更新已确认状态。
- `editor → versions → candidates`只继续提交最终待处理面板。
- `editor → versions → editor`回切时重新排队已确认面板；即使`versions`已进入Core写入，后续`editor`恢复写入仍保证最终权威状态与作者当前面板一致。
- 畸形或缺失`projectId`的请求键不进入共享回退通道，避免无关请求相互串行或覆盖。
- 新增可控Promise测试，验证真实执行顺序、最终Core写入、项目隔离和请求键降级。

## 验证结论

C0—C7验收基线产品源`9131a6db1f43d97e52aaa867010a316998f860fb`的Quality #2198完整执行Static、Unit、Integration、Migration、Coverage、Build、Package Smoke与Electron E2E并全部成功；Security #1988、Performance #1954及治理门同步成功。

C1并发硬化提交`0987f2237911289f6d91f94498b3278cc82628ed`已触发Quality #2208、Security #1998、Performance #1964、Evidence #1927、PR Policy #1956与Task Governance #2177；最终结果以该Head的GitHub Actions为准。

C1基线验收通过；并发硬化进入当前产品Head，最终Ready前仍需绑定最终产品源并完成Electron E2E及统一Evidence复核。

## 后续入口

C2从Schema 23开始实现GenerationRun、生产Prompt、ModelSupportProfile和TaskProtocol结果引用。Schema 22及继续写作合同保持向后兼容，不在后续检查点重建。
