# WorldForge CI与永久门禁架构

> 状态：Active  
> 分支模型：稳定`main` + 产品`work` + 治理`governance`

## 1. 工作流分层

| 工作流 | 触发 | 职责 | 永久Context |
|---|---|---|---|
| PR Policy | `work/governance → main` | 验证集成lane、同仓库来源、每lane单PR、永久自动化布局 | `pr-policy` |
| Quality | `work/governance → main` | 静态、Unit、Integration、Migration、Coverage、E2E、Build、Release Audit与Package Gate | `quality / quality` |
| Security | `work/governance → main` | 凭据、依赖与应用安全 | `security` |
| Performance | `work/governance → main`、手动 | 性能预算与AI Eval路由 | `performance` |
| Task Governance | 定时、手动 | 任务Runtime/索引治理与审计，不参与PR永久Context | 否 |
| Evidence | 定时、手动；Ready时由Quality Release Audit承接 | Evidence完整性与历史Verified扫描 | 否 |
| Controlled Merge | 四项永久Context成功且Fresh Ready验证通过 | 串行校验当前Head并Squash写入main | 否 |
| Main Verification | 合并后 | 核验最终main、来源PR/Head、Fresh来源门禁；产品任务发布任务Context | `main-verification` |
| Integration Branch Synchronization | Main Verification成功 | 同步来源lane，并安全快进另一条空闲lane | 否 |
| Branch Inventory / Hygiene | 主线验证后、定时、手动 | 保持远端恰好`main/work/governance` | 否 |
| Repository Governance | main变化、定时、手动 | 审计永久自动化和原生Ruleset | 否 |
| Release | 手动 | 发布门与三平台打包 | 否 |

## 2. PR形态

正式PR只能采用：

```text
产品任务：Head = work
仓库治理：Head = governance
Base = main
来源仓库 = 当前仓库
同一lane开放PR数量 ≤ 1
```

`work`与`governance`可以各有一个开放PR并行存在，但main写入始终串行。产品任务使用`worldforge-task` marker与Schema 2 Runtime；纯治理PR不伪造任务ID或Runtime。

无任务marker的治理维护只能修改治理、测试、流程文档、构建治理等允许表面；一旦需要修改产品功能、数据库、IPC、产品数据模型或任务Evidence，应转入`work`正式任务闭包。

## 3. Ready永久门禁

服务器Ruleset与Controlled Merge共享以下四项永久Context：

```text
pr-policy
+ quality / quality
+ security
+ performance
```

`quality / quality`是顶层最终聚合结果，必须包含Core Quality、`quality / release-audit`与`quality / package-smoke`。Task Governance与Evidence不再作为第五、第六个永久Context。

Controlled Merge在四项Context成功后，仍要读取当前Head最新Quality、Security、Performance Workflow Run，并再次核对最新Quality中的Release Audit与Package Smoke，防止同SHA旧Draft成功结果被Ready复用。

## 4. Main Verification与任务事实

Main Verification固定输入：

```text
expected_sha
source_pr
source_head_sha
```

验证内容：

1. 工作流受检SHA与当前main一致；
2. 来源PR已真实合并，Head为`work`或`governance`，Base为`main`；
3. 来源Head与受检Head一致；
4. 来源PR最新Quality、Security、Performance成功；
5. 最终main静态一致性检查成功；
6. 发布`main-verification`；
7. 若来源为带`worldforge-task` marker的产品任务，则额外核对Schema 2 Runtime并发布`task-verification/<TASK-ID>`。

PR Head中的Schema 2 Runtime最高静态声明到`IMPLEMENTED`。最终Verified由来源绑定与任务Context计算，不再通过第二个关闭PR改写状态。

## 5. Integration Branch Synchronization

Main Verification成功后，同时处理`work`与`governance`。

来源lane：

- 必须仍等于来源PR受检Head；
- 不得存在新的同lane开放PR；
- 满足条件后按已验证Squash结果受控重置到当前main；
- 来源lane已前进时fail-closed，禁止覆盖新提交。

另一条lane：

- 已等于main：保持；
- 无开放PR，且当前Head只是main祖先：以非强制fast-forward同步到main；
- 存在开放PR：跳过同步，保留正在进行的工作；
- 无开放PR但存在独有或分叉提交：fail-closed，禁止force覆盖。

因此`governance → main`合并成功后，空闲`work`会自动跟随最新已验证main；`work → main`对空闲`governance`同理。

## 6. Branch Inventory与Hygiene

合法分支库存恰好为：

```text
main
work
governance
```

缺失`work`或`governance`时从当前main重建；其他分支属于漂移并按治理策略清理。三条固定分支均受永久保护。

Integration Branch Synchronization负责Ref同步；Branch Inventory/Hygiene负责库存完整性，两者职责分离。

## 7. 构建治理

- buildable workspace由`pnpm-workspace.yaml`与`workspace-architecture.json`共同发现和校验。
- Foundation Smoke读取各workspace真实`package.json exports`，禁止假设所有运行入口都是`dist/index.js`。
- Preload真实Electron运行入口为`dist/index.cjs`，Renderer真实运行JS入口为`dist/index.js`。
- 根Build与Package入口在消费桌面产物前清除Renderer/Preload中不被运行时消费的TSC影子`.js/.js.map`，保留真实入口、声明文件、HTML、CSS等资产。
- 三平台Package Smoke继续验证最终桌面包的真实启动与产物完整性。

## 8. 永久自动化约束

- 工作流必须通用，不得硬编码任务ID、固定PR编号或临时任务分支。
- 除受控PR Policy外，不引入额外高权限`pull_request_target`；禁止`repository_dispatch`作为隐藏写入通道。
- Checkout必须关闭凭据持久化。
- CI验证已提交的PR Head，正式源码、任务状态与Evidence不得由CI临时写回分支。
- 只有Controlled Merge可以正常写main；Integration Branch Synchronization只能更新`work/governance`集成Ref。
- 新增永久能力必须同步自动化库存、CI策略、当前权威文档和测试。
