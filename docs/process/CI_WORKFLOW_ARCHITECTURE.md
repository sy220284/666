# WorldForge CI与永久门禁架构

> 状态：Active  
> 分支模型：唯一`work`，稳定`main`

## 1. 工作流分层

| 工作流                | 触发                     | 职责                                                     | 必需检查                           |
| --------------------- | ------------------------ | -------------------------------------------------------- | ---------------------------------- |
| PR Policy             | PR→main                  | 验证唯一`work → main`、自动化布局和CI策略                | `pr-policy`                        |
| Task Governance       | PR→main                  | 验证授权Schema、任务Runtime和路径边界                    | `task-governance`                  |
| Trusted Governance    | PR target→main           | 从base执行只读策略，阻断Head自签Runtime或治理脚本        | 引导合并后启用`trusted-governance` |
| Quality               | PR→main                  | 静态、Unit、Integration、Migration、Coverage、E2E和Build | `quality / quality`                |
| Security              | PR→main                  | 凭据、依赖与应用安全                                     | `security`                         |
| Performance           | PR→main、手动            | 性能预算与AI Eval路由                                    | `performance`                      |
| Evidence              | PR、每周、手动           | 变化Evidence与全量Verified Evidence                      | `evidence`                         |
| Controlled Merge      | 永久检查完成             | 聚合同一Head并Squash合并                                 | 否                                 |
| Main Verification     | 合并后                   | 核验最终main SHA、来源PR、来源Head和静态一致性           | `main-verification`                |
| Work Synchronization  | Main Verification成功    | CAS保护下重置work到已验证main                            | 否                                 |
| Branch Hygiene        | 每周、手动、主分支验证后 | 审计仓库只存在main和work                                 | 否                                 |
| Repository Governance | 治理PR、每周、手动       | 审计永久自动化和原生Ruleset                              | 否                                 |
| Release               | 手动                     | 发布门与三平台打包                                       | 否                                 |

## 2. PR门禁

所有正式PR必须满足：

```text
Head = work
Base = main
来源仓库 = 当前仓库
开放work → main PR数量 = 1
```

禁止通过分支前缀识别治理任务。治理或任务类型由PR正文标记、Runtime和变更路径共同确定。

新任务使用`worldforge-task-authorization`标记，授权PR只允许任务卡、`PLANNED` Runtime与`TASK_INDEX`。普通`worldforge-task`实现PR必须使用base中已授权Runtime，Head只能推进状态和验证绑定。

Draft只限制合并，不用于跳过代码验证。文档-only降级必须基于变更路径。

## 3. Ready聚合检查

```text
pr-policy
+ task-governance
+ quality / quality
+ security
+ performance
+ evidence
```

Controlled Merge只接受当前Head最新一轮成功结果，并再次确认PR未落后main、无Changes Requested、无线程未解决。

## 4. Main Verification与任务关闭

Main Verification输入固定包含：

```text
expected_sha
source_pr
source_head_sha
task_id
```

验证内容：

1. 工作流运行SHA与最终main SHA一致，任务marker与Controlled Merge捕获值一致；
2. 来源PR为已合并的`work → main`；
3. 闭包Head与受检Head一致；
4. 实现PR的永久检查与按差异路由的完整质量矩阵成功；
5. 最终main静态检查成功；
6. 发布`main-verification`及任务验证状态。

PR Head中的Runtime最高声明到`IMPLEMENTED`。有效Verified由来源绑定和任务验证状态计算，不再通过第二个关闭PR写入。

## 5. Work Synchronization

该工作流拥有`contents: write`，仅用于更新`refs/heads/work`，不得写main或修改文件。

执行条件：

- Main Verification成功；
- 当前main仍为受检SHA；
- 能解析来源`work → main` PR；
- work仍等于来源受检Head或已不存在；
- 没有新的开放work PR。

满足后将work受控重置为已验证main。work已移动时必须失败，禁止覆盖新提交。

## 6. Branch Hygiene

Branch Hygiene只读审计分支清单：

```text
允许：main、work
其他任何分支：失败并报告
```

分支同步由Work Synchronization负责；两类职责不得合并。

## 7. 永久自动化约束

- 工作流必须通用，不得硬编码任务ID、PR编号或任务分支。
- `pull_request_target`只允许`trusted-governance.yml`使用；它只能检出base、读取Head数据、使用只读权限，禁止执行Head代码或依赖。其他工作流继续禁止该触发器；`repository_dispatch`全部禁止。
- Checkout必须关闭凭据持久化。
- 正式门禁验证已提交PR Head，前后执行clean-tree检查。
- 只有Controlled Merge可以写main；只有Work Synchronization可以更新work。
- 新增永久能力必须同步自动化库存、CI策略、文档和测试。
