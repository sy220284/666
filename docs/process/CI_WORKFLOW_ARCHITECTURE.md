# WorldForge CI与永久门禁架构

## 1. 工作流分层

| 工作流 | 触发 | 职责 | 必需检查 |
|---|---|---|---|
| `PR Policy` | PR→main | 分支、治理白名单和CI策略 | `pr-policy` |
| `Task Governance` | PR→main | 任务状态、允许路径和证据结构 | `task-governance` |
| `Quality` | PR→main | Draft跑静态检查；Ready后跑测试、E2E、Build和Package Smoke | `quality / quality` |
| `Security` | PR→main | Draft保留快速扫描；Ready后跑依赖和应用安全套件 | `security` |
| `Performance` | PR→main、手动 | Draft返回延期状态；Ready后跑性能基线 | `performance` |
| `Evidence` | PR→main | 校验发生变化的任务证据包 | `evidence` |
| `Auto Merge` | 永久检查完成 | 复核PR状态并squash合并，随后调度主线复核 | 否 |
| `Main Verification` | Auto Merge显式调度 | 在最终main SHA上重新执行完整Linux质量门 | `main-verification` |
| `Release` | 手动 | 发布门、三平台构建打包和Release | 否 |

`quality-core.yml`是Quality、Main Verification和Release共用的底层实现，不单独设为必需检查。

## 2. Draft快速反馈

Draft PR保留六个固定检查名称，但只执行低成本验证：

```text
PR Policy
+ Task Governance
+ Evidence
+ Quality：task、workspace、boundary、format、lint、typecheck
+ Security：快速扫描
+ Performance：明确延期到Ready
```

`ready_for_review`事件会在同一头SHA上重新运行Quality、Security和Performance的完整门禁；`converted_to_draft`会取消旧运行并恢复轻量模式。

Draft阶段的绿色状态不能授权合并。Auto Merge仍实时检查`pull.draft`，只有非Draft PR才能进入main。

## 3. 合并判据

进入main前必须同时通过：

```text
pr-policy
+ task-governance
+ quality / quality
+ security
+ performance
+ evidence
```

同时要求：头分支未落后main、没有Changes Requested、没有未解决线程，并且合并时头SHA与受检SHA一致。

## 4. 唯一主线验证入口

Auto Merge通过仓库令牌调用Merge API后，普通`push`事件不会可靠地再次启动工作流。因此受控合并完成后必须显式调度`main-verification.yml`。

`Quality`、`Security`、`Performance`、`Evidence`和`Task Governance`只服务PR，不再监听`push main`。最终main提交只由Main Verification复核，避免双入口、空白状态和重复全量验证。

Main Verification负责：

1. 核对最终main SHA与输入SHA；
2. 核对来源PR、来源头SHA和merge SHA；
3. 核对来源PR六项永久检查均为最新成功结果；
4. 在最终main提交上重新执行完整Quality Core；
5. 生成`main-verification`聚合状态。

`main-verification`不加入本次PR的Ruleset，否则会形成合并前等待合并后检查的循环。

## 5. 诊断产物

Quality Core和Performance仅在失败时上传日志、截图、trace及测试结果，默认保留7天。成功运行依赖GitHub日志；版本化任务证据仍保存在`docs/test-evidence/<TASK-ID>/`，Actions Artifact不能替代正式证据。

## 6. 权限与发布

- 常规工作流使用只读权限，Checkout关闭凭证持久化。
- 禁止特权PR触发器和工作流直接写main。
- Auto Merge只拥有复核、合并及调度固定主线工作流所需权限。
- Main Verification只读，不能修改仓库。
- Release保持手动触发，要求main引用、完整质量门、三平台Build后Package、独立发布环境和SHA-256清单。
