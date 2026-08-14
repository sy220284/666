# M12-03 作者效率与专业写作增强

> 状态：Planned  
> 里程碑：M12 作者生产力与长期项目增强  
> 优先级：P2  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

集中收口 M11 主链完成后仍有价值的作者效率与专业写作增强：升级现有 CommandCatalog 为统一快捷键权威、增加自定义快捷键与打字机模式、提供高级三栏冲突视图、增强 StoryComment 工作流，并补齐 Theme B 护眼/高对比与短印文能力。

本任务不得重建已经由 M11-07 落地的 Ctrl/Cmd+K Command Palette、命令目录基础、SearchTools 混合搜索或 Atomic Navigation。

## 依赖与阶段定位

- 依赖：M11-07 有效 VERIFIED。
- M12 阶段建议在 M12-02、M12-01 之后执行；不建立对 Research / Journal 的硬依赖。
- 复用现有 Renderer UI Store、SearchTools、AuthorNavigationTarget / Atomic Navigation、Candidate / Diff、Validation / StoryComment、Theme A/B 和应用设置。

## 已完成能力基线

M11-07 已经提供：

- 唯一 `COMMAND_CATALOG` 登记点。
- Ctrl/Cmd+K Command Palette。
- 页面导航、章节、伏笔、Draft / Version / Entity 搜索结果混合展示。
- SearchTools 统一全文搜索。
- Atomic Navigation / AuthorNavigationTarget 跳转。
- “规划这一章 / 生成这一章 / 改写选中内容”等智能创作命令。
- IME composition 下的快捷键安全处理、Esc 关闭与焦点返回。

因此本任务只允许**扩展现有实现**，禁止另建 `CommandCatalogV2` 平行注册表、第二套命令面板、第二套搜索结果模型或任意 Renderer callback 命令总线。

## 一、CommandCatalog 元数据升级与自定义快捷键

将现有 `COMMAND_CATALOG` 扩展为按钮、菜单、命令面板、默认快捷键和自定义快捷键共享的单一命令身份来源。

每个需要快捷键治理的命令至少补充：

- command id
- command scope
- 是否允许输入框内触发
- 是否允许只读模式执行
- 默认快捷键 nullable
- 可否重绑定
- Windows / macOS / Linux modifier 显示规则
- 统一 handler / target identity
- 危险动作是否需要既有确认流程

### 自定义快捷键

作者可以为 Catalog 中允许重绑定的命令设置快捷键，覆盖值保存在现有 app/project typed settings。

要求：

1. 禁止绑定到未登记命令。
2. 检测冲突并要求作者显式解决。
3. Windows/macOS/Linux 修饰键显示正确。
4. 中文 IME composition 期间不得误触破坏性命令。
5. Ctrl/Cmd+K、默认快捷键、自定义快捷键、菜单/按钮入口共用同一 command id。
6. read-only、LockGuard、确认流程和既有权限不得被快捷入口绕开。
7. 将 AppShell 中现有硬编码 Ctrl/Cmd+K 监听收敛进统一快捷键解析规则，但不得重写现有 Command Palette UI/搜索逻辑。

## 二、打字机模式

在现有写作工作台与沉浸写作上增加可切换打字机模式：

- 当前输入行/块保持在可配置视觉区域。
- 不修改正文结构和保存逻辑。
- 不破坏 IME、选择、拖拽、撤销重做、查找替换和辅助技术。
- 切章、恢复 continuation、窗口缩放和 DPI 变化后位置正确。
- 与沉浸写作正交：作者可单独或同时启用。

状态只属于 Renderer 临时 UI 或 typed display setting，不为纯视图状态新增项目数据库表。

## 三、高级三栏冲突视图

在现有 Candidate / Draft / Base 冲突模型之上增加专业模式三栏视图：

```text
基础版本 | 当前稿 | 建议稿/拟应用结果
```

要求：

1. 复用现有 Diff、Candidate Apply、Conflict 与 Undo 数据，不新建第二套冲突引擎。
2. 三栏只改变展示和作者选择方式，最终写入仍走既有 Candidate Apply 事务。
3. 长章节支持同步滚动、折叠未修改区和按块定位。
4. 冲突基础已 stale 时禁止直接采用。
5. 无 Base 或窗口不足时可降级为现有双栏/单栏，不阻塞基础审阅。
6. 正式平台体验矩阵使用 QHD / QHD+ / UWQHD / 4K；窗口或高DPI导致的窄有效CSS视口允许降级为双栏/单栏，不把FHD及以下恢复为正式支持。

## 四、StoryComment 工作流增强

在现有 StoryComment / Validation / StoryTodo 之上增强，不新建第二套批注领域。

增加：

- 标签。
- 状态筛选。
- 来源筛选。
- 章节 / 人物 / 问题类型筛选。
- reopen。
- 多选批量 resolve / reopen / tag。

规则：

1. 批处理逐项校验 project scope 与当前状态。
2. 使用单一可解释事务策略，失败时不得产生静默部分提交。
3. ValidationIssue / StoryTodo / StoryComment 的权威边界保持不变。
4. 标签仅服务作者工作流，不自动改变 Validation 或 Canon 语义。

## 五、Theme B 扩展

当前 AppSettings 已定义 eye-care / high-contrast variant，但 Theme B 仍只允许 light / dark。本任务只补齐 Theme B 剩余变体与短印文，不重建主题系统。

实现：

- Theme B 护眼变体。
- Theme B 高对比变体。
- 作者自定义短印文文本。

约束：

1. 自定义印文只接受短文本/允许字符，不加载任意脚本、HTML 或外部字体。
2. 印文仅为表现层，不参与业务状态、导出正文和 AI Prompt。
3. 主题切换不得影响业务结果。
4. 高对比模式必须满足现有可访问性门禁。
5. 复用现有 ThemeId / ThemeVariant / settings persistence，不建立第二套主题配置。

## 数据与设置

优先复用现有 app/project typed settings。

允许的最小结构变化：

- 现有 CommandCatalog 元数据扩展。
- 快捷键覆盖配置。
- 打字机模式偏好。
- Theme B 变体与印文文本。
- StoryComment 标签等确有消费方的字段/关联表。

不得为纯 Renderer 状态新建数据库表，也不得把 CommandCatalog 做成可被任意数据驱动注入的脚本执行系统。

## 非目标

- 不重建 Ctrl/Cmd+K Command Palette。
- 不重建 SearchTools / FTS。
- 不重建 Atomic Navigation / AuthorNavigationTarget。
- 不建立第二份 CommandCatalog。
- 不建立第二套 Candidate Conflict / Diff / Apply。
- 不重做 Theme A/B 基础架构。
- 不把快捷键做成任意脚本、宏或插件执行系统。

## 安全与可访问性

- 快捷键和命令面板不得绕开命令权限、read-only、LockGuard 或确认流程。
- 三栏冲突采用不得绕开 Candidate Apply。
- 键盘操作、焦点顺序、屏幕阅读器标签、对比度和缩放必须进入正式验收。
- 自定义文本必须经过显示层转义。
- 快捷键在 IME composition、模态框和危险确认流程中必须服从统一焦点/输入所有权。

## 自动化测试

至少覆盖：

### Command / Shortcut

- 现有 CommandCatalog 单一身份保持。
- 默认快捷键 / 重绑定 / 冲突 / 平台差异。
- IME composition 下快捷键安全。
- 菜单 / 按钮 / Command Palette / 快捷键共用 command id。
- read-only / LockGuard / 确认流程无法被快捷键绕过。
- Ctrl/Cmd+K 现有搜索、导航、命令执行无回归。

### Writing

- 打字机模式输入、选择、撤销、切章、continuation、DPI、沉浸模式组合。
- 三栏冲突 Base / Current / Candidate 对齐、stale 阻断和采用/撤销。
- QHD / QHD+ / UWQHD / 4K 正式体验矩阵。
- 高DPI/窄窗口有效CSS视口的双栏/单栏降级专项（非低分辨率硬件支持）。

### Comment / Theme

- 批注筛选、标签、reopen、批量状态变更与失败回滚。
- Theme B 护眼/高对比与自定义印文。
- 视觉回归、键盘、无障碍。

验证矩阵沿用当前正式质量体系，按 Unified Risk Matrix 触发必要重型验证，不恢复无差别全量 CI。

## Evidence

保存到：`docs/test-evidence/M12-03/`

必须保存：

- 现有 CommandCatalog 被扩展而非复制的证明。
- 快捷键统一身份、IME 安全与权限边界 Evidence。
- 打字机模式真实中文输入体验。
- 三栏/降级显示矩阵。
- StoryComment 批处理事务/失败路径。
- Theme B 可访问性结果。

## 回滚策略

所有增强均应可独立关闭或整体回滚；回滚不得改变 Draft、Version、Candidate、Validation、StoryComment 的既有权威语义。

CommandCatalog 元数据回滚不得让既有 Ctrl/Cmd+K、菜单或按钮失去原有可执行动作身份。

## 完成条件

- 自定义快捷键建立在现有 CommandCatalog 上，无第二命令体系。
- 打字机模式可用于连续中文写作且不破坏保存、IME、选择和撤销。
- 高级三栏冲突视图复用现有 Candidate / Diff / Apply 权威并支持窗口降级。
- StoryComment 标签、筛选、reopen 与批处理形成可用闭环。
- Theme B 护眼/高对比与自定义印文进入正式显示与可访问性验收。
- M11-07 已完成的 Ctrl/Cmd+K、SearchTools、Atomic Navigation 不被重复实现且无回归。
