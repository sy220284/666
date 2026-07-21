# WorldForge 开发自动化控制规范

> 状态：Active  
> 集成分支：`main`  
> 授权来源：作者要求所有改动通过Pull Request进入`main`，并优先提升真实开发吞吐量。

## 1. 目标

工作流只保留四类控制：任务边界、代码质量、数据与安全边界、可追溯合并。自动化不得把日常开发变成重复的发布验收，也不得为同一提交重复运行等价套件。

## 2. 权威状态

- `docs/tasks/ACTIVE_TASK.json`：唯一机器状态。
- `docs/tasks/ACTIVE_TASK.md`：由JSON生成的可读镜像。
- `docs/tasks/TASK_INDEX.md`：任务依赖与阶段状态。
- 独立任务卡：目标、非目标、影响范围和验收要求。

`pnpm task:validate`负责校验机器状态、镜像和必读文档。镜像不一致时运行`pnpm task:sync`，禁止手工维护双重状态。

## 3. 开发主路径

```text
激活一张任务
→ 创建独立任务分支
→ 校验依赖和allowedPaths
→ 最小完整端到端实现
→ 本地专项验证
→ 原子更新正式PR Head
→ Draft PR静态反馈
→ Ready PR必要门禁
→ Controlled Merge执行squash
→ Main Verification核验最终SHA与静态一致性
→ 进入下一任务
```

约束：

1. 同一时刻只有一张`IN_PROGRESS`任务。
2. 所有正式文件必须直接提交到任务分支，CI不得生成业务代码后代替开发提交。
3. 任何数据库、Migration、安全、项目边界、事务、恢复或数据损坏失败立即阻断，不得延期。
4. `Implemented`表示真实代码、必要专项测试和远端门禁已通过；不等于最终发布验收。
5. `Verified`用于里程碑或批次关闭，不要求每张任务单独再开一张纯关闭PR。
6. 禁止机器人直接写`main`；只有Controlled Merge可在永久检查通过后调用Merge API。
7. 正式PR分支不是远程逐文件调试区。使用连接器写入时，必须先汇总完整文件，以Git Blob/Tree/Commit一次更新同一批改动；禁止连续`update_file`产生调试提交。确需修复时，应先完整定位失败原因，再用一个原子修复提交更新Head。

## 4. M3阶段冻结规则

M3-06至M3-10按连续实现模式推进：

```text
实现任务
→ 登记Implemented
→ 记录deferredVerification
→ 激活下一任务
```

在M3-10完成前，冻结M3普通任务的独立Verified关闭PR。只有以下情况可中断连续实现：

- 数据安全或结构完整性缺陷；
- 已实现代码阻断后续任务；
- 任务状态或主线来源失真；
- 作者明确要求立即复验。

M3-10完成后统一执行一次M3批次复验，集中关闭M3-01、M3-03、M3-05及其他延期项。M4开始前必须完成M3阶段闭环。

## 5. Draft与Ready门禁

### 5.1 Draft PR

Draft只运行一套快速反馈：

```text
Quality
└─ task:validate
   workspace / boundary
   format / lint / typecheck
```

PR Policy、Task Governance、Evidence、Security和Performance在Draft阶段不启动Runner，转为Ready后再针对当前Head执行。Draft绿色状态没有合并资格。

### 5.2 Ready PR

Ready执行：

- PR Policy：真实分支、永久自动化与CI策略；
- Task Governance：状态、镜像、allowedPaths和任务转换；
- Quality：静态检查、Unit、Integration、Migration、Electron E2E和Build；
- Security：Secret Scan始终执行，Dependency Audit仅在依赖或Workflow输入变化时执行，Application Security仅在任务声明或安全边界变化时执行；
- Performance：仅在任务明确要求`pnpm test:perf`、性能测试/Eval/Prompt/Editor路径变化或手动触发时执行；
- Evidence：只检查本次变更的任务证据文档；
- Controlled Merge：复核Head SHA、审查状态、未解决线程和六项检查结果后squash合并。

普通PR不运行Package Smoke。打包验证只在Release或明确涉及打包配置、Electron发布链路时执行。普通PR不承担全历史Evidence重放，也不在合并后再次执行完整发布级套件。

## 6. Main Verification

Main Verification只负责最终提交真实性：

1. 核对最终`main` SHA；
2. 核对来源PR、来源Head SHA和六项永久检查；
3. 运行task、workspace、boundary、format、lint、typecheck静态复核；
4. 发布`main-verification`状态。

全量Unit、Integration、Migration、Electron E2E、Package、Security和Performance已经在Ready PR、专项门或里程碑门执行，合并后不再重复执行。

## 7. 证据规则

证据是文档记录，不是截图工程。

每个任务证据目录只强制：

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

规则：

- `summary.md`集中记录实现范围、实际测试结果、人工复核、质量结论和必要说明；
- `commands.txt`只记录真实执行过的命令、退出码和必要上下文；
- `known-risks.md`记录剩余风险，无风险时明确写“无”；
- `manifest.json`只负责文件完整性和来源提交绑定；
- 不要求截图、截图目录、截图清单、单独人工验收文件或单独质量矩阵；
- 不得为了证据专门生成用户不查看的截图或Artifact；
- 未运行、失败或环境限制必须如实写入文档，不得用模板文字伪装完成。

旧证据包可保留历史截图和附加文件，只要Manifest完整；新证据默认只生成上述文本集合。

## 8. Evidence运行范围

- PR事件：只校验本次发生变化的证据目录；
- 每周定时：重放全部`Verified`证据；
- 手动入口：在里程碑关闭、审计或发布前全量重放；
- Release：执行发布验收需要的最终证据检查。

历史证据不会因普通业务代码提交自动变化，因此禁止在每个PR重复全量扫描。

## 9. 测试路由

| 变更范围 | 必要追加验证 |
|---|---|
| Migration、Repository、事务 | `test:migration`、`test:integration` |
| Electron Main、Preload、IPC、路径、恢复、安全 | `test:security`、`test:e2e` |
| Editor、Candidate、Revision、Lock | `test:unit`、`test:integration`、`test:e2e` |
| Prompt、Provider、约束包、Eval | `test:eval`、`test:integration`，必要时`test:perf` |
| 性能、DPI、FTS、搜索、流式处理 | `test:perf`，必要时`test:e2e` |
| 纯文档和证据文本 | 静态与治理检查，不运行无关业务套件 |

路由不得跳过任务卡明确要求的专项测试。风险分类不确定时按更高风险执行。

## 10. 发布边界

Release保持手工触发并冻结到M8。正式发布仍执行：

- 完整Quality；
- Security与Performance；
- Linux、Windows、macOS构建打包；
- Release Gate、校验和与不可变发布资产。

发布级验证不下沉到每张日常任务卡。

## 11. 完成真实性

任何状态回写前必须确认：

- 修改已存在于实际PR Head；
- 入口、导出、IPC、Migration、UI与测试没有断链；
- 声明通过的命令确实执行成功；
- Evidence文档引用的是已提交且可达的来源提交；
- Controlled Merge和Main Verification针对同一代提交。

未实际落地或未复核的内容不得声明完成。
