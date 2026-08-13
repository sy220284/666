# M12-03 作者效率、命令与个性化增强

> 状态：Planned  
> 里程碑：M12 作者生产力与长期项目增强  
> 优先级：P2  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

集中收口仍有价值但不应打断 M11 主链的作者体验增强：统一命令目录与 `Ctrl+K` 命令面板、自定义快捷键、打字机模式、高级三栏冲突视图、更丰富的批注筛选/标签/批处理，以及 Theme B 个性化能力。

所有功能只扩展现有编辑、搜索、导航、审阅和显示体系，不新增平行业务真源、第二套搜索服务或第二套动作清单。

## 依赖

- M11-07 有效 VERIFIED 后启动；在当前 M11-06 顺延任务完成编号落主线前，本卡保持 Planned，不得提前启动。
- 不依赖 Research 或 Journal；M12-01、M12-02 与本任务属于可独立推进的产品能力。
- 复用 M11-07 已登记的智能创作动作，以及现有 Renderer UI Store、SearchTools、AuthorNavigationTarget / Atomic Navigation、Candidate/Diff、Validation/StoryComment、Theme A/B 和应用设置。

## 一、统一 CommandCatalog、Ctrl+K 与自定义快捷键（P1-KEY）

建立唯一 `CommandCatalog`（或等价只读命令注册表），作为作者命令身份的唯一来源。

### CommandCatalog

每个命令至少登记：

- command id
- 中文显示名称
- command scope
- 是否允许输入框内触发
- 是否允许只读模式执行
- 默认快捷键 nullable
- 可否重绑定
- Windows / macOS / Linux modifier 显示规则
- 执行入口/handler identity

禁止通过字符串拼接或任意 Renderer callback 建立绕过 Catalog 的“隐藏命令”。

### Ctrl+K Command Palette

`Ctrl+K` 由本任务统一建设，复用现有全文搜索与 Atomic Navigation，可搜索或执行：

- 章节、人物、设定、伏笔、历史版本等现有可导航对象。
- 现有页面动作。
- M11-07 已登记的“规划这一章 / 生成这一章 / 改写选中内容”等智能创作命令。

命令面板不得维护第二份动作列表；搜索结果与命令结果必须有明确类型边界。

### 自定义快捷键

作者可为 Catalog 中允许重绑定的命令设置快捷键。

用户覆盖值保存在现有应用设置或具名 typed settings，不新增任意命令执行接口。

要求：

1. 禁止绑定到未登记命令。
2. 检测冲突并要求作者显式解决。
3. Windows/macOS/Linux 修饰键显示正确。
4. 中文 IME composition 期间不得误触破坏性命令。
5. Ctrl+K、默认快捷键、自定义快捷键、菜单/按钮入口共用同一 command id。
6. read-only、LockGuard、确认流程和既有权限不得被快捷入口绕开。

## 二、打字机模式（P1-TYPE）

在现有写作工作台与沉浸写作上增加可切换打字机模式：

- 当前输入行/块保持在可配置视觉区域。
- 不修改正文结构和保存逻辑。
- 不破坏 IME、选择、拖拽、撤销重做、查找替换和辅助技术。
- 切章、恢复 continuation、窗口缩放和 DPI 变化后位置正确。

状态只属于 Renderer 临时 UI 或 typed display setting。

## 三、高级三栏冲突视图（P1-CONFLICT）

在现有 Candidate / Draft / Base 冲突模型之上提供高级三栏视图：

```text
基础版本 | 当前稿 | 建议稿/拟应用结果
```

要求：

1. 复用现有 Diff、Candidate Apply、Conflict 与 Undo 数据，不新建第二套冲突引擎。
2. 三栏只改变展示和作者选择方式，最终写入仍走既有 Candidate Apply 事务。
3. 长章节支持同步滚动、折叠未修改区和按块定位。
4. 冲突基础已 stale 时禁止直接采用。
5. 正式平台体验矩阵统一使用 1920×1080、2560×1440、3840×2160；1280×800 仅作为窄窗口 graceful degradation 专项，验证自动降级为两栏/单栏，不再作为正式三平台权威档位。

## 四、批注增强

在现有 StoryComment / Validation / StoryTodo 上增加：

- 标签。
- 状态筛选。
- 来源筛选。
- 章节/人物/问题类型筛选。
- 多选批量 resolve/reopen/tag。

批处理必须逐项验证项目归属和当前状态，并通过单一事务策略保证失败时不存在部分不可解释提交。

## 五、Theme B 个性化

承接旧 P1 额外护眼/高对比变体与原 V1.5“作者自定义 Theme B 印文”。

实现：

- Theme B 护眼变体。
- Theme B 高对比变体。
- 作者自定义短印文文本。

约束：

1. 自定义印文只接受短文本/允许字符，不加载任意脚本、HTML 或外部字体。
2. 印文仅为表现层，不参与业务状态、导出正文和 AI Prompt。
3. 主题切换不得影响业务结果。
4. 高对比模式必须满足现有可访问性门禁。

## 数据与设置

优先复用现有 app/project typed settings。

允许的最小结构变化：

- CommandCatalog 的静态/类型化命令登记。
- 快捷键覆盖配置。
- 打字机模式偏好。
- Theme B 变体与印文文本。
- StoryComment 标签等确有消费方的字段/关联表。

不得为纯 Renderer 状态新建数据库表，也不得把 CommandCatalog 做成可被任意数据驱动注入的脚本执行系统。

## 安全与可访问性

- 快捷键和命令面板不得绕开命令权限、read-only、LockGuard 或确认流程。
- 三栏冲突采用不得绕开 Candidate Apply。
- 键盘操作、焦点顺序、屏幕阅读器标签、对比度和缩放必须进入正式验收。
- 自定义文本必须经过显示层转义。
- 命令面板在 IME composition、模态框和危险确认流程中必须服从统一焦点/输入所有权。

## 自动化测试

至少覆盖：

- CommandCatalog 唯一命令身份与重复登记拒绝。
- Ctrl+K 搜索、导航、命令执行与 Atomic Navigation 一致性。
- M11-07 智能创作命令只注册到统一 Catalog，不维护第二清单。
- 快捷键默认/重绑定/冲突/平台差异。
- IME composition 下 Ctrl+K 与快捷键安全。
- 菜单/按钮/命令面板/快捷键共用 command id。
- 打字机模式输入、选择、撤销、切章、DPI。
- 三栏冲突 Base/Current/Candidate 对齐、stale 阻断和采用/撤销。
- FHD / QHD / 4K 正式体验矩阵。
- 1280×800 窄窗口两栏/单栏降级专项。
- 批注筛选、标签、批量状态变更与部分失败回滚。
- Theme B 护眼/高对比与自定义印文。
- 视觉回归、键盘、无障碍。

验证矩阵沿用当前正式质量体系，按 Unified Risk Matrix 触发必要重型验证，不恢复无差别全量 CI。

## Evidence

保存到：`docs/test-evidence/M12-03/`

除常规记录外必须保存 CommandCatalog / Ctrl+K / 快捷键统一身份、IME 安全和正式平台体验矩阵 Evidence。

## 回滚策略

所有能力均应可独立关闭或整体回滚；回滚不得改变 Draft、Version、Candidate、Validation、StoryComment 的既有权威语义。CommandCatalog 回滚不得让既有菜单/按钮失去可执行动作身份。

## 完成条件

- `P1-KEY/P1-TYPE/P1-CONFLICT` 完整落地。
- CommandCatalog 成为 Ctrl+K、默认快捷键、自定义快捷键、菜单/按钮的唯一命令身份来源。
- Ctrl+K 复用现有 SearchTools 与 Atomic Navigation，不建立平行搜索或导航服务。
- 批注筛选、标签和批处理形成可用闭环。
- Theme B 护眼/高对比与自定义印文进入正式显示与可访问性验收。
- FHD / QHD / 4K 作为正式平台体验权威，窄窗口降级独立验证。
- 所有增强均复用现有命令、Diff、Candidate、Comment 和 Theme 权威，不产生第二套实现。
