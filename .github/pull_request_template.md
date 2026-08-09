## 任务

<!-- 普通任务PR必须填写；治理PR可留空。 -->
<!-- worldforge-task: M10-03 -->
<!-- worldforge-change-set: concise-change-set-name -->

- 任务编号：
- 任务卡：
- Runtime：
- 本PR是否将任务登记为IMPLEMENTED：是 / 否

## 分支与来源

- [ ] Head精确为`work`
- [ ] Base精确为`main`
- [ ] 来源仓库为当前仓库
- [ ] 当前没有第二个开放的`work → main` PR
- [ ] `work`开始实施时与最新已验证`main`一致

## 实现

- [ ] 仅修改获批允许范围
- [ ] 已补齐必要的数据结构升级、契约、IPC、测试和文档
- [ ] 未引入Renderer直接访问Node、SQLite、文件系统、环境变量或凭据的旁路
- [ ] 成功、失败、取消、冲突、只读、恢复和重启路径已按影响覆盖
- [ ] 作者可见内容使用正式中文名称
- [ ] 无TODO、空实现、固定成功、演示假数据或静默吞错

## 验证

- [ ] PR Policy
- [ ] Task Governance
- [ ] 正式中文名称检查
- [ ] Quality
- [ ] Security
- [ ] Performance
- [ ] Evidence
- [ ] 必要专项测试与关联回归

## 状态与Evidence

- [ ] Runtime状态与TASK_INDEX一致
- [ ] Evidence绑定当前PR和最终受检work Head
- [ ] 登记IMPLEMENTED时已填写`verificationBinding`
- [ ] 未将合并前状态冒充为Verified

## 风险与回退

- 风险：
- 回退方式：

> 仓库同一时刻只允许一个`work → main`正式PR。Ready Head通过六项永久门禁后由Controlled Merge执行Squash；Main Verification成功后计算任务有效状态，Work Synchronization仅在work未移动且无新PR时受控重置到已验证main。
