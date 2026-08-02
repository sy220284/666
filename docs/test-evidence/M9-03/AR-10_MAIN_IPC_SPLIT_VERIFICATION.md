# AR-10 Main IPC拆分验证与回退记录

## 1. 检查点

- 任务：M9-03 / AR-10
- PR：#273
- 基线main：`e80552afec44916cc3821e933fc477badbad178a`
- 前置检查点：AR-09受检Head `9a02b83f6fd83e45a76ed5a27e4618394422426f`
- AR-10受检Head：`d3400deedff2ff7a04ab9b509a96df4f00dfc3dc`
- Quality Run：`30726171522`
- Security Run：`30726171433`
- Performance Run：`30726171417`
- Evidence Run：`30726171438`
- 结果：AR-10实现与完整PR质量矩阵通过。

## 2. 结构结果

AR-10前，`apps/desktop/main/src/ipc-handlers.ts`集中承载统一异常转换、可信来源校验、Schema拒绝、应用设置、项目生命周期、恢复、规划、Canon、Structure、Writing、AI凭据与Task事件。AR-10完成后：

```text
apps/desktop/main/src/
├─ ipc-handlers.ts                 总注册与确定性释放
├─ handler-guard.ts                可信来源、Schema错误、异常转换与错误语义
├─ app-ipc-handlers.ts             App、Settings、最近项目与诊断
├─ project-ipc-handlers.ts         项目生命周期与继续写作状态
├─ recovery-ipc-handlers.ts        备份、恢复与文本导入导出
├─ planning-ipc-handlers.ts        任务书、情节节点与场景节拍
├─ canon-ipc-handlers.ts           Entity Canon
├─ structure-ipc-handlers.ts       卷章、回收站及跨章操作
├─ writing-ipc-handlers.ts         Draft、Candidate、Version与AI凭据
├─ task-ipc-handlers.ts            Task命令与MessagePort连接
└─ provider-ipc-handlers.ts        既有Provider注册器保持独立
```

根入口由约千行收敛为37行组合根。统一Guard与八个领域注册器均低于350行预算；Main装配不再包含具体Channel或Command Schema。

## 3. 安全、协议与事务边界

专项验证确认：

- 97个正式IPC通道及测试Fixture通道保持完整，98个Channel属性分别归入唯一领域；`taskConnectEvents`仅因注册和释放出现两次；
- 所有Invoke Handler继续先校验可信`senderFrame.url`，再校验权威Command Schema；
- 不可信来源与无效负载继续返回`COMMON_INVALID_INPUT_001`；
- 未捕获异常继续转换为`COMMON_INTERNAL_999`，生成诊断ID并记录隐私安全日志；
- Query/Mutation继续经`coreOperationFailureSemantics`保留不同的正式错误文案、重试性和用户动作；
- Project、Recovery文件选择取消继续返回`COMMON_CANCELLED_004`；
- AI凭据继续只在Main进程通过`CredentialBroker`读写；
- Task命令与Task MessagePort连接归入同一注册器；释放时移除Listener；
- Provider注册器、Invoke Handler集合与Task Listener按固定顺序释放；
- Fixture通道即使未启用，也进入对称`removeHandler`清理集合；
- 公开IPC字符串、协议版本、数据库Schema、Migration、Core命令及Renderer/Preload调用表面均未修改。

## 4. 自动验证

受检Head `d3400deedff2ff7a04ab9b509a96df4f00dfc3dc`：

```text
Evidence             PASS
Task Governance      PASS
PR Policy            PASS
Security             PASS
Performance          PASS
Format               PASS
Lint                 PASS
Typecheck            PASS
Unit                 PASS
Integration          PASS
Migration             PASS
Coverage             PASS
Build                PASS
Electron E2E         PASS
Quality aggregate    PASS
Package Smoke Gate   PASS（本检查点无需实际打包矩阵）
```

Coverage：

```text
测试文件     232 / 232通过
测试数量     1025 / 1025通过
Statements   84.69%
Branches     75.03%
Functions    84.86%
Lines        86.78%
```

AR-10新增真实行为矩阵覆盖37条成功命令路径、37条独立不可信来源拒绝路径及10条独立Schema拒绝路径；未扩大Coverage排除范围，也未降低75%分支门槛。

## 5. 回退

AR-10未改变持久化格式或公开IPC表面，可按模块边界回退：

1. 将`ipc-handlers.ts`恢复到AR-09检查点；
2. 删除`handler-guard.ts`与八个新领域注册器；
3. 恢复旧源码定位测试；
4. 删除AR-10结构、成功命令和拒绝分支专项测试；
5. 重新运行Static、Unit、Integration、Migration、Security、Coverage、Build和Electron E2E。

若发现P0来源校验、正式错误语义、凭据隔离或Listener释放回归，应整体回退AR-10到`9a02b83f6fd83e45a76ed5a27e4618394422426f`，不得在AR-11中追补Main IPC缺陷。

## 6. 结论

AR-10满足冻结工作包要求，可以将M9-03活动检查点切换至AR-11。PR #273继续保持Draft；AR-11—AR-14全部完成前不得转Ready或合并。
