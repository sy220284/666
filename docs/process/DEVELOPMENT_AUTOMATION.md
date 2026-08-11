# WorldForge 开发自动化控制规范

> 状态：Active  
> 授权模式：`single-work-pr` + permanent governance lane

## 1. 目标

自动化只承担代码质量、数据与安全边界、可追溯合并、主分支验证、集成分支同步和分支库存治理。自动化不得生成业务代码、伪造任务状态或绕过真实验证。

Task Governance、Evidence与Runtime负责项目管理、证据和合并后的任务事实闭包；工程门禁由PR Policy、Quality、Security、Performance、Controlled Merge和Main Verification承担。

## 2. 固定分支与职责

仓库永久只允许三条分支：

```text
main        已验证主线
work        产品任务集成lane
 governance  仓库治理集成lane
```

固定写入路径：

```text
产品任务：work → main
仓库治理：governance → main
```

规则：

1. `main`禁止直接push，只允许Controlled Merge写入。
2. `work → main`与`governance → main`各最多一个开放PR，两条lane可以并行。
3. 产品任务Runtime固定`executionBranch: work`；治理维护不得伪造产品任务Runtime。
4. 远端不得长期存在第四条分支；Branch Inventory负责修复到`main/work/governance`精确库存。
5. 两条lane使用相同PR Policy、Quality、Security、Performance、Controlled Merge和Main Verification，不允许治理lane绕门禁。

## 3. 权威状态

- `docs/tasks/runtime/<TASK-ID>.json`：任务范围、静态状态、依赖、验证命令和合并后状态绑定。
- `docs/tasks/TASK_INDEX.md`：任务导航与静态进度镜像，不能单方面提升Schema 2任务为Verified。
- GitHub Commit Status：`main-verification`与`task-verification/<TASK-ID>`提供最终有效事实。
- `.github/governance/required-checks.json`：服务器Ruleset与Controlled Merge共同读取的最小Context真源。
- `quality / quality`：Quality Workflow最终聚合Context，汇总Core Quality、Release Audit和package gate。
- GitHub Actions最新Workflow Run：Controlled Merge读取当前Head最新Quality、Security、Performance运行，禁止复用旧Draft绿灯。

Schema 2任务有效状态：

```text
Runtime IN_PROGRESS
→ IN_PROGRESS

Runtime IMPLEMENTED
+ task-verification/<TASK-ID>缺失/失败
→ VERIFICATION_PENDING

Runtime IMPLEMENTED
+ task-verification/<TASK-ID>=success
→ VERIFIED
```

## 4. 产品任务路径

```text
最新已验证main
→ 确认work为空闲基线并与main同步
→ 在work完成实现、测试、文档与Evidence
→ work → main PR
→ Draft诊断；必要时full-validation-draft跑完整矩阵
→ Evidence/Runtime收口
→ 转Ready
→ Fresh Quality + Security + Performance
→ Controlled Merge
→ Squash Merge
→ Main Verification
→ 发布main-verification与task-verification/<TASK-ID>
→ Integration Branch Synchronization
→ Branch Inventory/Hygiene
```

产品任务闭环至少要求：来源work PR验证成功、Controlled Merge完成、`main-verification=success`、任务Context成功、没有新的work PR、`work == main`。

## 5. 治理维护路径

```text
最新已验证main
→ governance保持/恢复到main基线
→ 在governance修改.github/scripts/tests/docs/process/治理类配置
→ governance → main PR
→ 与产品PR相同的Fresh Ready门禁
→ Controlled Merge
→ Main Verification
→ Integration Branch Synchronization
→ Branch Inventory/Hygiene
```

无`worldforge-task` marker的治理PR不得修改产品功能、Task Runtime或任务Evidence。若治理发现必须改产品代码，应转入正式产品任务，不借治理lane扩大权限。

## 6. Ready与Controlled Merge

永久工程Context保持四项：

```text
pr-policy
quality / quality
security
performance
```

`quality / quality`必须聚合Core Quality、`quality / release-audit`与`quality / package-smoke`。Controlled Merge还会读取当前Head最新Quality、Security、Performance Workflow Run，确保成功事实来自最新Ready轮次。

同一Head先跑Draft再转Ready时，旧成功Context不能直接作为合并凭据。只要最新一轮运行中、失败或取消，合并必须阻断。

## 7. Main Verification与任务事实

Main Verification重新核对：

- 当前main SHA等于受检合并结果；
- 来源PR已真实合并且来自`work`或`governance`；
- 来源Head与受检Head一致；
- 来源PR最新Quality/Security/Performance均成功；
- 当前main静态一致性检查成功。

产品PR带`worldforge-task` marker时，还必须核对Runtime的`status=IMPLEMENTED`、`executionBranch=work`、来源PR绑定及两个Context名称，成功后同时发布任务Context。

治理PR无任务marker，只发布`main-verification`。

## 8. Integration Branch Synchronization

Main Verification成功后，同时处理`work`与`governance`两条集成lane。

### 8.1 来源lane

来源lane必须仍等于来源PR受检Head且没有新开放PR；随后按已验证Squash结果受控重置到最新main。若来源lane在合并后出现新提交或新PR，自动同步fail-closed，禁止覆盖。

### 8.2 另一条lane

另一条lane按以下规则处理：

```text
已经等于main
→ keep

无开放PR + 当前Head只是main祖先
→ non-force fast-forward到最新main

存在开放PR
→ skip，保留正在进行的工作

无开放PR但存在独有/分叉提交
→ blocked，禁止force覆盖
```

因此：

- `governance → main`合并并通过Main Verification后，空闲`work`会自动同步最新main；
- `work → main`合并后，空闲`governance`同样自动同步；
- 任一lane正在通过开放PR工作时，另一条lane的合并不会覆盖它。

同步完成后必须重新读取Ref验证结果，不能只依赖PATCH请求返回成功。

## 9. Branch Inventory与Hygiene

远端合法库存恰好为：

```text
main
work
governance
```

Branch Inventory缺少`work`或`governance`时从当前main重建；发现第四条分支时按治理策略删除。`main/work/governance`均为永久保护分支。

## 10. 构建与发布治理

- Foundation打包入口必须读取buildable workspace真实`package.json exports`，禁止硬编码所有包为`dist/index.js`。
- Preload真实Electron运行入口为`dist/index.cjs`；Renderer真实运行JS入口为`dist/index.js`。
- 根`build`、`package`与`package:foundation`在消费桌面产物前执行`prune-desktop-dist.mjs`，清除Renderer/Preload中TSC生成但运行时不消费的影子`.js/.js.map`，保留真实运行入口、类型声明、HTML与CSS。
- 三平台Package Smoke继续负责验证真实打包产物；Stable发行仍要求相应平台签名/公证信任证据。

## 11. Evidence与Release边界

Evidence必须绑定真实受检work实现提交。失败、跳过和环境限制必须如实记录。Verified Evidence扫描与任务Context属于不同职责：前者进入Quality/Release Audit，后者由合并后的Main Verification发布。

产品Release资格独立读取当前main的`main-verification`、产品门禁、三平台产物完整性和发行信任证据，不从Task Runtime推导。

## 12. 完成真实性

完成声明前必须重新读取真实远程状态并确认：

1. 修改存在于真实PR Head；
2. 最新Ready Quality/Security/Performance成功；
3. Controlled Merge绑定受检Head；
4. `main-verification`成功，产品任务需要的`task-verification/<TASK-ID>`成功；
5. 来源lane已同步到main；
6. 空闲兄弟lane也已快进到main，或其开放PR被明确保留；
7. 远端分支库存恰好为`main/work/governance`。
