# M10-01 验证摘要

- 任务：M10-01 异步生命周期与竞态硬化。
- 来源PR：#294。
- 实施受检Head：`8eb48404a7c9012be57983255c13cf325ed1a552`。
- Ready最终受检Head：`138a2eacaf2ba2f9d2825473b5189137fea426d1`。
- 合并提交：`7067e3ca6caf8c72b28c8e1bf16af5add478a39d`。
- Main Verification：`30783708113`，成功。
- Ready永久门禁：Quality `30783010382`、Security `30783010303`、Performance `30783010325`、Evidence `30783010306`、Task Governance `30783010313`、Repository Governance `30783010304`、PR Policy `30783010310`，全部成功。

## 实施结果

1. 章节会话在Flush和挂载阶段阻止重复切换；加载期间允许最新章节请求替代旧请求且不重复保存。
2. Flush失败时旧请求代次失效，并恢复当前编辑器至符合只读状态的可编辑性。
3. Task事件缺口恢复期间若继续收到缺口，首轮Snapshot恢复结束后再次读取，避免ACK后遗漏最后状态。
4. 新增章节状态策略、Task恢复交错、源码不变量和Candidate加载分支测试。
5. pnpm从被官方标记为broken的11.13.0统一升级至11.13.1，覆盖根工程、永久Actions和离线工具链。
6. 性能文件改为单文件串行执行，消除并行重负载对事件循环预算的交叉干扰；预算值与断言未放宽。

## 自动验证

```text
Workspace / Boundaries / Format / Lint / Typecheck   PASS
Unit / Integration / Migration / Coverage           PASS
Build / Electron E2E 33/33                          PASS
Security / Performance / Evidence                   PASS
Task / Repository Governance / PR Policy            PASS
Linux / Windows / macOS Package Smoke               PASS
Main Verification                                   PASS
```

覆盖率：

```text
测试文件     242 / 242通过
测试数量     1053 / 1053通过
Statements   85.00%
Branches     75.46%
Functions    85.18%
Lines        87.09%
```

相较M9终验的Branches 75.03%，分支覆盖率提高至75.46%；75%门槛和Renderer具名排除清单均未调整。

## 兼容边界

本任务未修改数据库Schema、历史Migration、IPC Channel、协议版本、错误码、公开Bridge签名、Draft Revision和IME输入语义。

## 最终状态

M10-01已完成Ready永久门禁、受控合并和main验证，正式关闭为Verified。仓库恢复`VERIFIED_HOLD`。
