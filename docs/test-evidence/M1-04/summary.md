# M1-04 实现证据摘要

日期：2026-07-16
分支：`main`
状态目标：Implemented（`implementation-mainline`，非Verified）

## 已实现

- 新增Project Schema v3：`drafts`、`draft_blocks`、活动Draft唯一约束以及Chapter/Draft/DraftBlock数据库外键。
- 新建章节原子创建活动Draft与空paragraph；v2遗留章节首次读取时按需补建，`project.sqlite`仍是唯一正文真源。
- Core提供严格归属校验的`draft.get`和M1-04过渡`draft.saveSnapshot`，快照替换、块ID生成和排序键写入均在单写事务中完成。
- Renderer通过具名Preload白名单连接Core；Renderer不能提交记录ID、排序键、来源、锁定、Hash或Revision等权威字段。
- `editor-core`实现paragraph、dialogue、heading、separator四类Tiptap节点和DraftBlock双向映射。
- Enter拆分保留左块logicalBlockId，右块先使用临时clientBlockId；Backspace合并保留前块logicalBlockId；块类型转换不丢失身份。
- 中文composition期间暂停结构命令、工具栏结构写入和保存，同时让操作系统输入法完成候选提交；composition结束后仅标记未保存。
- 网页粘贴重建白名单语义，移除脚本、样式、事件属性、布局节点、隐藏内容和不支持节点；纯文本换行可安全进入正文。
- ProseMirror本地撤销/重做与每章选区保留；Core返回新ID后以非历史事务同步元数据，撤销/重做仍保留持久化logicalBlockId。
- 最小可用UI支持打开章节、四类块编辑、撤销/重做、显式保存、复制、只读浏览、失败保留窗口正文和关闭重开重建。
- Tiptap固定为`3.27.3`；该版本满足仓库供应链等待期，未新增等待期例外。Renderer由esbuild打包，不在`file://`运行时留下裸包导入。

## 验收映射

- P0-013：四类DraftBlock、长中文段落、Enter/Backspace身份规则、撤销/重做和重开重建均有自动测试。
- P0-014的M1-04部分：composition结构保护、拼音/五笔事件路径和无逐键IPC提交已实现；800ms自动保存属于M1-06。
- P0-015：网页脚本、复杂样式、隐藏内容和纯文本粘贴场景已进入桌面E2E源码。
- P0-016的正文编辑基础已建立；当前章查找和字数属于M1-06，当前任务不显示伪入口。
- 数据安全：跨项目/跨Draft logicalBlockId被拒绝，Renderer权威字段被strict Schema拒绝，故障注入证明删除旧块后的异常会整笔回滚。
- 只读：未来Schema项目可读取已有Draft并复制，写入在Core和UI双层禁用。

## 自动验证结果

- 完整测试：34个测试文件，143项通过，1项按root权限条件跳过。
- Migration专项：6个测试文件，21项通过。
- Integration专项：8个测试文件，24项通过。
- Security专项：8个测试文件，38项通过，1项按root权限条件跳过。
- Unit专项：8个测试文件，34项通过。
- Performance专项：4个测试文件，26项通过；另有20万中文字符级长段落无损往返单元用例。
- Lint、TypeScript、构建、格式、包边界、工作区图、任务控制、发布工具检查、基础打包和依赖供应链检查均通过。
- Electron E2E源码可解析为8个场景，应用完整构建通过；当前Linux执行环境没有`DISPLAY`或`xvfb-run`，运行器以`E2E_DISPLAY_UNAVAILABLE`退出，未宣称桌面E2E通过。

## 范围确认

未实现Block Patch、Revision递增、内容Hash、锁定、自动保存、字数、当前章查找、Version、Candidate或AI写入。`draft.saveSnapshot`是M1-05前的显式保存过渡入口，相关延期在`known-risks.md`中登记。
