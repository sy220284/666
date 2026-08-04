# M10-04 实施验证摘要

- 任务：M10-04 兼容面收敛治理。
- 来源PR：#312。
- 受检实现提交：`28b5e54d0dcc472ef1dedb788664723a9e7cb87d`。
- 启动基线：`main == work == 8f54dc4e5ed46d6ffca999fda29887f2302b1030`。
- Draft静态矩阵已通过Task Governance、PR Policy、Workspace、Boundaries、Format、Lint和Typecheck；独立Security与Performance门禁成功。

## 已完成治理

1. 删除空载Renderer Legacy Loader、空所有权清单及`legacy-compatibility`启动阶段；结构测试继续阻止旧Renderer模块回流。
2. 删除`ACTIVE_TASK.json/.md`与旧`taskctl`入口；当前任务控制只读取Schema 2授权、Runtime和任务索引。
3. 活动任务Runtime强制Schema 2；已Verified历史Runtime保持冻结，只用于历史依赖和状态读取。
4. `CentralBridgeCommandSchema`成为中央主桥Schema真源；`RegisteredCommandSchema`保留为同对象V1兼容别名。
5. `public-index.ts`明确为`@worldforge/contracts`唯一包根入口；`index.ts`仅为内部基础聚合。
6. 旧备份元数据成功解析后采用临时文件和原子替换规范化；规范化失败保留原文件并继续兼容读取。
7. 分支卫生与发布资格不再读取旧兼容锚点；发布门按任务索引、Runtime和提交状态计算有效终态。

## 保留边界

- SQLite逐级Migration、未来Schema只读打开、Checksum与完整性失败保护保持不变。
- OpenAI Compatible、Anthropic及批准的Custom Provider适配保持不变。
- IPC协议版本门禁、数据库Schema、Migration、IPC Channel和Command字符串保持不变。
- 已Verified历史Runtime、Migration和Evidence未批量改写。

## Ready验收

Ready Head必须通过Unit、Integration、Migration、Coverage、Build、Electron E2E及独立Security、Performance、Evidence、Task Governance和PR Policy。Package Smoke与Windows微软拼音由永久路径策略判定适用性，跳过只能记录为不适用。
