## 类型

- [ ] 产品任务：`work → main`
- [ ] 仓库治理：`governance → main`

## 任务

<!-- 仅产品任务PR填写；治理PR留空且不得伪造Runtime/Evidence。 -->
<!-- worldforge-task: M11-03 -->

- 任务编号：
- 任务卡：
- Runtime：
- 本PR是否将任务登记为IMPLEMENTED：是 / 否 / 不适用

## 分支与来源

- [ ] Head精确为`work`或`governance`，与本PR类型一致
- [ ] Base精确为`main`
- [ ] 来源仓库为当前仓库
- [ ] 当前没有第二个同lane开放PR
- [ ] 执行lane建立在安全的最新main基线上

## 实现

- [ ] 仅修改获批允许范围
- [ ] 产品任务已补齐必要的数据结构升级、契约、IPC、测试和文档；治理PR不越界修改产品功能
- [ ] 未引入Renderer直接访问Node、SQLite、文件系统、环境变量或凭据的旁路
- [ ] 成功、失败、取消、冲突、只读、恢复和重启路径已按影响覆盖
- [ ] 作者可见内容使用正式中文名称
- [ ] 无TODO、空实现、固定成功、演示假数据或静默吞错

## 永久门禁

- [ ] `pr-policy`
- [ ] `quality / quality`
- [ ] `security`
- [ ] `performance`
- [ ] 必要专项测试与关联回归

## 状态与Evidence

<!-- 产品任务必填；治理PR不适用。 -->

- [ ] Runtime状态与TASK_INDEX一致 / 不适用
- [ ] Evidence绑定当前PR和最终受检work Head / 不适用
- [ ] 登记IMPLEMENTED时已填写`verificationBinding` / 不适用
- [ ] 未将合并前状态冒充为Verified

## 风险与回退

- 风险：
- 回退方式：

> Ready Head通过四项永久门禁后由Controlled Merge执行Squash。Main Verification成功后，产品任务发布`task-verification/<TASK-ID>`；Integration Branch Synchronization将来源lane同步到已验证main，并仅在另一条lane空闲、无开放PR且没有独有提交时自动fast-forward。远端永久分支库存为`main/work/governance`。
