# M12-03 作者效率、审阅与个性化增强

> 状态：Planned  
> 里程碑：M12 作者生产力与长期项目增强  
> 优先级：P2  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

集中收口仍有价值但不应打断 M11 主链的作者体验增强：自定义快捷键、打字机模式、高级三栏冲突视图、更丰富的批注筛选/标签/批处理，以及 Theme B 个性化能力。所有功能只扩展现有编辑、审阅和显示体系，不新增平行业务真源。

## 依赖

- M12-02 有效 VERIFIED。
- 复用现有 Renderer UI Store、Candidate/Diff、Validation/StoryComment、Theme A/B、应用设置与 Atomic Navigation。

## 一、自定义快捷键（P1-KEY）

支持作者为已登记命令配置快捷键。

### 设计

建立唯一 `CommandBindingCatalog` 或等价只读命令注册表，记录：

- command id
- 默认快捷键
- 可否重绑定
- 作用域
- 是否允许输入框内触发
- 平台差异

用户覆盖值保存在现有应用设置或具名 typed settings，不新增任意命令执行接口。

### 要求

1. 禁止绑定到未登记命令。
2. 检测冲突并要求作者显式解决。
3. Windows/macOS/Linux 修饰键显示正确。
4. 中文 IME composition 期间不得误触破坏性命令。
5. Ctrl+K 命令面板与快捷键共用同一命令身份，不维护第二份动作清单。

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
4. 1280×800 下自动降级为两栏/单栏，不强行挤压正文。
5. 冲突基础已 stale 时禁止直接采用。

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

- 快捷键覆盖配置。
- 打字机模式偏好。
- Theme B 变体与印文文本。
- StoryComment 标签等确有消费方的字段/关联表。

不得为纯 Renderer 状态新建数据库表。

## 安全与可访问性

- 快捷键不得绕开命令权限、read-only、LockGuard 或确认流程。
- 三栏冲突采用不得绕开 Candidate Apply。
- 键盘操作、焦点顺序、屏幕阅读器标签、对比度和缩放必须进入正式验收。
- 自定义文本必须经过显示层转义。

## 自动化测试

至少覆盖：

- 快捷键默认/重绑定/冲突/平台差异。
- IME composition 下快捷键安全。
- Ctrl+K 与快捷键命令身份一致。
- 打字机模式输入、选择、撤销、切章、DPI。
- 三栏冲突 Base/Current/Candidate 对齐、stale 阻断和采用/撤销。
- 1280×800 降级。
- 批注筛选、标签、批量状态变更与部分失败回滚。
- Theme B 护眼/高对比与自定义印文。
- 视觉回归、键盘、无障碍。

验证矩阵沿用当前正式质量体系。

## Evidence

保存到：`docs/test-evidence/M12-03/`

## 回滚策略

所有能力均应可独立关闭或整体回滚；回滚不得改变 Draft、Version、Candidate、Validation、StoryComment 的既有权威语义。

## 完成条件

- `P1-KEY/P1-TYPE/P1-CONFLICT` 完整落地。
- 批注筛选、标签和批处理形成可用闭环。
- Theme B 护眼/高对比与自定义印文进入正式显示与可访问性验收。
- 所有增强均复用现有命令、Diff、Candidate、Comment 和 Theme 权威，不产生第二套实现。
