# M10-04 兼容面收敛治理

> 状态：In Progress  
> 优先级：P1  
> 基线：`main == work == 8f54dc4e5ed46d6ffca999fda29887f2302b1030`

## 目标

收敛已经失去兼容对象的内部兼容壳，保留并强化用户数据、外部Provider和协议版本安全兼容。治理不得改变产品功能、IPC字符串、数据库Schema、Migration历史或既有公开Bridge签名。

## 实施范围

1. 删除空载Renderer Legacy Loader、Legacy Ownership清单及其启动阶段；保留防止旧Renderer模块重新引入的结构测试。
2. 将`ACTIVE_TASK.json/.md`和旧`taskctl`退出当前任务执行链；当前及未来任务只读取Schema 2授权、Runtime、任务卡和索引。
3. 历史Schema 1 Runtime仅允许作为冻结历史读取，禁止新建或作为活动任务Runtime。
4. 为中央主桥命令Schema建立准确名称；旧导出仅作为兼容别名，并在源码中标注退出窗口。
5. 明确Contracts唯一公共入口，消除内部入口命名歧义，不改变包根公开导出集合。
6. 将旧备份元数据兼容从永久动态双读改为校验后的原子规范化写回；无法安全写回时继续只读兼容，不影响备份可恢复性。
7. 更新执行入口、任务索引和兼容所有权文档，使其匹配真实主分支状态。

## 保留边界

- SQLite旧Schema逐级Migration、未来Schema只读打开、Checksum和完整性失败保护必须保留。
- OpenAI Compatible、Anthropic及批准的Custom Provider适配必须保留。
- `protocolVersion`严格版本门禁必须保留。
- 已Verified历史Runtime、Migration和Evidence不得批量改写。
- 不新增生产依赖，不扩大产品范围。

## 验收

- Renderer启动路径不再包含Legacy Loader、`legacy-compatibility`阶段或无效错误分支。
- 当前任务命令和治理门禁不再依赖`ACTIVE_TASK.json/.md`或`scripts/taskctl.mjs`。
- 新任务Runtime强制Schema 2；历史Schema 1只读验证仍可通过。
- 内部代码使用准确的中央主桥Schema名称，旧名称不产生第二套Schema真源。
- 旧备份元数据读取后可原子升级为当前格式，升级失败不会损坏原文件。
- Unit、Integration、Migration、Coverage、Electron E2E、Security、Performance、Evidence、Task Governance和PR Policy按永久路由通过。

## 回退

整体回退本任务PR即可。备份元数据规范化必须先写临时文件再原子替换；一旦失败，删除临时文件并保留原元数据。数据库、Migration和作品正文不参与本任务写入。
