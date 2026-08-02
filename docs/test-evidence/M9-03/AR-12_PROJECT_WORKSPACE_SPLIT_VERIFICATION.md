# AR-12 Project Workspace拆分验证与回退记录

## 1. 检查点

- 任务：M9-03 / AR-12
- PR：#273
- 基线main：`e80552afec44916cc3821e933fc477badbad178a`
- 原子落盘提交：`d4e5ece1361297c79a34f5eb203888747b987a03`
- 创建链消环提交：`83504f76b63be58aab7781914cada03d3ad69234`
- 最终受检Head：`03ebce1bb458df36118abc50091bba62676ffa14`
- Quality Run：`30736392281`
- Security Run：`30736392153`
- Performance Run：`30736392162`
- Evidence Run：`30736392159`
- Task Governance Run：`30736392165`
- PR Policy Run：`30736392141`
- 结果：AR-12实现、结构整改、覆盖率治理与完整PR质量矩阵通过。

## 2. 结构结果

兼容入口`packages/core-service/src/project-workspace.ts`由1027行收敛为单行公开重导出，内部拆分为：

```text
packages/core-service/src/project-workspace/
├─ project-workspace-service.ts
├─ project-create.ts
├─ project-open.ts
├─ project-move.ts
├─ workspace-verifier.ts
├─ workspace-path-policy.ts
└─ workspace-manifest.ts
```

公开`ProjectWorkspaceService`、`ProjectWorkspaceServiceOptions`、`ProjectWorkspaceError`、错误码、构造方式、方法签名和根导出路径保持兼容。创建、打开、关闭、移动、恢复登记、项目读写、路径解析和Shutdown仍通过同一服务表面提供。

拆分前先通过一次性候选生成链完成8个目标文件的虚拟TypeScript编译，最终诊断数为0；候选文件与脚手架未在生产落盘前暴露为半成品。生产落盘时，8个生产文件替换与全部候选脚手架删除在同一原子Tree中完成。

## 3. 问题发现与真实整改

### 3.1 创建链环依赖

生产落盘后的边界门禁发现创建模块经`project-structure.ts`回流Project Workspace Facade与Draft依赖，形成真实循环链。

整改方式：

- 将新项目首次卷、首次章节及初始Draft引导逻辑内聚至`project-create.ts`。
- 移除Create对更高层`project-structure.ts`的反向依赖。
- 保留相同数据库事务、默认标题、排序键、Draft语义、内容Hash与作者工作流结果。
- 未增加循环依赖白名单、结构债务豁免或跨层例外。

### 3.2 Static规范缺口

生产门禁发现一个纯类型导入和一个`this`别名不符合仓库Lint规则。整改仅调整类型导入与Operation Context闭包引用方式，没有改变运行逻辑。

### 3.3 Coverage阈值缺口

拆分后全量测试全部通过，但全局Branches一度为74.98%，低于75%门槛0.02个百分点。整改通过新增`tests/unit/ar12-project-workspace-path-policy-branches.test.ts`覆盖路径策略的真实拒绝与分类分支，最终Branches为75.04%。

未降低Coverage阈值，未增加Coverage排除，未通过无意义执行或删除分支规避门禁。

## 4. 行为、事务与安全边界

专项及既有测试确认：

- 同一进程只允许一个活动项目，重复Request仍由有界幂等缓存收敛。
- 创建工作区继续使用私有目录权限、暂存目录、原子Rename、最新Migration与Manifest校验。
- Starter项目继续在同一数据库事务中创建首卷、首章和初始Draft；Blank模式不创建默认结构。
- Onboarding任务书、主角、首章目标和SceneBeat继续在项目创建事务内原子提交。
- 打开流程继续校验绝对路径、Manifest、数据库身份、Schema兼容、只读模式和迁移恢复点。
- Manifest、数据库与最近项目身份不一致时仍拒绝激活，失败后不会残留半活动上下文。
- 路径解析继续阻断相对逃逸、绝对路径注入、符号链接逃逸、控制字符和不安全工作区名称。
- 移动流程继续执行空间预检、复制、双端Hash校验、目标打开验证、最近项目更新与源目录清理；任一步失败均保留可恢复源。
- 项目读写继续校验活动Project ID与只读状态，数据库写入仍由原有单写队列处理。
- Shutdown与Close仍等待生命周期尾队列并安全释放数据库上下文。
- 未修改数据库Schema、历史Migration、IPC协议、公开错误码或用户可见文案。

## 5. 自动验证

最终受检Head `03ebce1bb458df36118abc50091bba62676ffa14`：

```text
Evidence             PASS
Task Governance      PASS
PR Policy            PASS
Security             PASS
Performance          PASS
Workspace             PASS
Boundaries            PASS
Format                PASS
Lint                  PASS
Typecheck             PASS
Unit                  PASS
Integration           PASS
Migration             PASS
Coverage              PASS
Build                 PASS
Electron E2E          PASS
Quality aggregate     PASS
```

Coverage：

```text
测试文件     233 / 233通过
测试数量     1027 / 1027通过
Statements   84.65%
Branches     75.04%
Functions    84.89%
Lines        86.74%
```

仓库结构检查覆盖336个源码文件、988条相对导入边及15项已登记结构债务；本次未新增循环依赖或结构债务。

## 6. 回退

AR-12未修改数据库Schema、Migration、IPC协议或公开Facade表面。若后续发现项目身份、路径安全、创建事务、只读打开、移动校验或生命周期行为回归，应整体回退：

1. 将`packages/core-service/src/project-workspace.ts`恢复至AR-11检查点的单文件实现。
2. 删除`packages/core-service/src/project-workspace/`新增内部模块。
3. 恢复拆分前Project Workspace测试定位，并保留与行为缺陷无关的安全回归测试。
4. 重新运行Static、Unit、Integration、Migration、Security、Coverage、Build和Electron E2E。
5. 回退后重新核对创建暂存目录清理、移动源保留、Manifest身份、只读模式和最近项目登记。

## 7. 结论

AR-12满足冻结工作包要求，可以将M9-03活动检查点切换至AR-13。PR #273继续保持Draft；AR-13与AR-14全部完成前不得转Ready或合并。
