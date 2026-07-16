# M1-03 实现证据摘要

日期：2026-07-16  
分支：`main`  
状态目标：Implemented（`implementation-mainline`，非Verified）

## 已实现

- 新增追加式Project Migration `0002_volume_chapter_lifecycle.sql`，建立`volumes`、`chapters`和最小`trash_entries`。
- 新项目默认原子创建“第一卷/第一章”，创建向导可显式选择专业空白结构。
- Core提供卷章查询、新增、编辑、同级排序、跨卷移动、软删除、废纸篓列表和恢复Use Case。
- 排序键使用SQLite 64位整数、初始间隔1024、中点插入；整数间隙耗尽时只在同一父节点内事务重排。
- 严格Zod契约、Main可信来源校验、Preload具名`planning`/`trash`白名单和Renderer最小可操作卷章树已接通。
- 只读项目允许结构浏览，所有结构写命令由Core拒绝且UI禁用。
- v1项目升级前使用SQLite Online Backup创建`0600`迁移恢复点，执行`quick_check`并合并WAL；完整BackupRecord、恢复副本和恢复中心仍属于M1-08。
- `active_draft_id`与`final_version_id`保持可空；M1-04和M1-07建立目标表后再通过追加Migration补齐数据库外键。

## 验收映射

- P0-034基础卷章部分：创建、更新、排序、跨卷移动、软删除均有Core/IPC/UI闭环与自动测试。
- P0-056基础部分：卷章TrashEntry、恢复原位、原位占用重排、恢复到末尾均已实现；永久删除及影响二次确认不在本任务范围。
- 数据安全：结构写入走唯一ProjectDatabase串行事务；注入中断后TrashEntry与软删除同时回滚。
- 持久性：关闭并重开项目后卷章顺序、状态和目标字数保持一致。

## 自动验证结果

- 完整测试：30个测试文件，131项通过，1项按root权限条件跳过。
- Migration专项最终结果：5个测试文件，19项通过。
- Integration专项：7个测试文件，22项通过。
- Security专项：7个测试文件，36项通过，1项按root权限条件跳过。
- Lint、TypeScript、构建、格式、包边界、工作区图、任务控制、发布工具检查和基础打包均通过。
- Electron E2E源码与应用构建通过；当前Linux执行环境没有`DISPLAY`或`xvfb-run`，运行器以`E2E_DISPLAY_UNAVAILABLE`退出，未宣称桌面E2E通过。

## 范围确认

未实现ProjectBrief、PlotNode、SceneBeat、正文Draft、Tiptap、Version、拆并章、跨章正文移动、永久删除或完整恢复中心。
