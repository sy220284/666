# AR-09 Preload拆分验证与回退记录

## 1. 检查点

- 任务：M9-03 / AR-09
- PR：#273
- 基线main：`e80552afec44916cc3821e933fc477badbad178a`
- 前置检查点：AR-08受检Head `e59aa7ea5733ea0042cad09a7bff73f3834ac4b2`
- AR-09受检Head：`9a02b83f6fd83e45a76ed5a27e4618394422426f`
- Quality Run：`30707436147`
- Security Run：`30707436012`
- Performance Run：`30707436014`
- Evidence Run：`30707436016`
- 结果：AR-09实现与完整PR质量矩阵通过。

## 2. 结构结果

AR-09前，`apps/desktop/preload/src/index.ts`同时承载Envelope构造、Schema校验、IPC调用、Task MessagePort订阅以及App、Project、Planning、Writing、Recovery和Task全部Bridge实现。AR-09完成后：

```text
apps/desktop/preload/src/
├─ index.ts                       27行组合入口
├─ bridge-runtime.ts              统一Envelope与Schema校验IPC调用
├─ app-bridge-factory.ts          App、Settings与最近项目
├─ project-bridge-factory.ts      项目生命周期、结构与回收站
├─ planning-bridge-factory.ts     任务书、情节节点与场景节拍
├─ writing-bridge-factory.ts      草稿、候选稿、版本与AI凭据
├─ recovery-bridge-factory.ts     恢复、备份与文本导入导出
├─ task-bridge-factory.ts         Task命令、MessagePort与序列恢复
└─ lifecycle-bridge.ts            既有关闭握手保持独立
```

根入口只负责Factory装配和`contextBridge.exposeInMainWorld('worldforge', bridge)`。所有领域Factory均低于350行，最大Planning Factory为323行。

## 3. 兼容与安全边界

专项验证确认：

- `window.worldforge`公开方法与嵌套领域表面保持不变；
- 所有请求继续在Preload中先经权威Command Schema解析，再进入IPC；
- 所有返回继续经权威Result Schema解析；
- Envelope继续包含协议版本、UUID请求号和ISO发送时间；
- Task MessagePort继续校验事件Envelope、发送ACK、抑制重复事件并在序号缺口时读取Snapshot；
- 取消订阅继续关闭Port并阻止迟到Snapshot发布；
- Preload领域Factory不引入Node文件系统、数据库、环境变量或原始通用`send()`表面；
- Main/Renderer现有调用方无需迁移；
- 独立的Candidate Preview、Continuity、Narrative Planning、Rhythm、Search、State Proposal和Validation Bridge保持原暴露方式；
- IPC通道字符串、协议版本、数据库Schema、Migration和正式错误码均未修改。

## 4. 自动验证

受检Head `9a02b83f6fd83e45a76ed5a27e4618394422426f`：

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
测试文件     229 / 229通过
测试数量     1016 / 1016通过
Statements   85.13%
Branches     75.34%
Functions    84.78%
Lines        86.94%
```

新增或调整的专项断言覆盖Factory职责边界、统一运行时、Task序列恢复、独立Bridge暴露和Preload安全表面。既有`preload-bridge-coverage.test.ts`的五项真实契约回归全部通过。

永久`Engineering Validation / full`与PR Quality均调用同一`quality-core.yml`完整矩阵；当前连接器无法创建`workflow_dispatch`，因此本检查点以同一Head的PR完整Quality、独立Security、Performance与Evidence结果作为受检证据。最终AR-14仍需通过永久工作流执行完整终验。

## 5. 回退

AR-09未改变持久化格式、IPC字符串或公开Bridge，可按模块边界回退：

1. 将`apps/desktop/preload/src/index.ts`恢复到AR-08检查点；
2. 删除`bridge-runtime.ts`和六个领域Factory；
3. 恢复Preload安全测试到单文件入口定位；
4. 删除AR-09边界专项测试；
5. 重新运行Static、Unit、Integration、Migration、Security、Coverage、Build和Electron E2E。

若发现P0 Bridge兼容或Task事件回归，应整体回退AR-09到`e59aa7ea5733ea0042cad09a7bff73f3834ac4b2`，不得在AR-10 Main IPC拆分中追补Preload缺陷。

## 6. 结论

AR-09满足冻结工作包要求，可以将M9-03活动检查点切换至AR-10。PR #273继续保持Draft；AR-10—AR-14全部完成前不得转Ready或合并。
