# AR-08 Contracts拆分验证与回退记录

## 1. 检查点

- 任务：M9-03 / AR-08
- PR：#273
- 基线main：`7adafeeadb973e5cb035c301602c511c2aa065c5`
- 前置检查点：AR-07受检Head `18558ef8088cac6553609b0ffd3c5f3abe52468c`
- AR-08受检实现Head：`e59aa7ea5733ea0042cad09a7bff73f3834ac4b2`
- Quality Run：`30703877307`
- 结果：AR-08实现与完整Draft质量矩阵通过。

## 2. 结构结果

AR-08前，`packages/contracts/src/index.ts`同时承载领域重导出、协议版本、IPC通道、命令集合、Envelope与Registered Command、应用运行时结果、Core控制事件以及完整`WorldforgeBridge`表面，共1016行。AR-08完成后：

```text
packages/contracts/src/
├─ index.ts                    20行兼容重导出
├─ protocol-registry.ts        协议、通道、命令、Envelope与注册命令
├─ app-runtime-contracts.ts    应用结果、Core控制/事件与公共结果类型
├─ worldforge-bridge.ts        window.worldforge公开Bridge类型表面
└─ 既有领域契约模块            保持独立且不改Schema
```

根入口只保留兼容重导出。Main、Preload、Renderer和Testkit继续从`@worldforge/contracts`使用原有名称，不需要同步改写。

## 3. 公开兼容边界

AR-08在拆分前固化编译后公开运行时表面，并在拆分后进行精确比对：

```text
PROTOCOL_VERSION     1
IPC_CHANNELS         97项
APP_COMMANDS         96项
运行时导出           835项
规范化SHA-256        a841f0657b53bc59b45109093c89621e0b131c8a81ab7d4824942f608e7a5590
```

专项测试同时验证：

- 公开运行时导出名称、命令键值和IPC Channel键值精确一致；
- `RegisteredCommandSchema`继续使用原Schema实例；
- App、Core、诊断、Credential、Task结果Schema保持原实例；
- `WorldforgeBridge`公开接口与拆出后的内部接口双向精确赋值；
- `public-index.ts`继续兼容重导出根入口；
- Main、Preload、Renderer和Testkit原调用方无需一次性跨包迁移；
- 数据库Schema、历史Migration、Channel字符串、协议版本、正式错误码和Bridge方法签名均未修改。

## 4. 自动验证

受检Head `e59aa7ea5733ea0042cad09a7bff73f3834ac4b2`：

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
Migration            PASS
Coverage             PASS
Build                PASS
Electron E2E         PASS
Quality aggregate    PASS
```

Coverage：

```text
测试文件     228 / 228通过
测试数量     1011 / 1011通过
Statements   85.12%
Branches     75.34%
Functions    84.74%
Lines        86.93%
```

新增`ar08-contracts-public-surface.test.ts`验证公开运行时表面哈希、兼容根装配和Bridge类型精确一致。拆出的`protocol-registry.ts`、`app-runtime-contracts.ts`与`worldforge-bridge.ts`在覆盖矩阵中均为100%。

本次Draft路由未执行Windows原生拼音Job。AR-08只调整Contracts内部模块边界，没有修改Writing Editor、IME协议或Renderer输入路径；最终Ready全矩阵仍必须执行Windows原生验收。

## 5. 回退

AR-08未改变持久化格式、协议或公开Bridge，可按模块边界回退：

1. 将`packages/contracts/src/index.ts`恢复到AR-07检查点；
2. 删除`protocol-registry.ts`、`app-runtime-contracts.ts`和`worldforge-bridge.ts`；
3. 删除AR-08公开表面专项测试；
4. 重新运行Static、Unit、Integration、Migration、Coverage、Build和Electron E2E。

若发现P0兼容回归，应整体回退AR-08到`18558ef8088cac6553609b0ffd3c5f3abe52468c`，不得在AR-09 Preload拆分中追补Contracts缺陷。

## 6. 结论

AR-08满足冻结工作包要求，可以将M9-03活动检查点切换至AR-09。PR #273继续保持Draft；AR-05—AR-14全部完成前不得转Ready或合并。
