# M4-04 风险、回滚与测试矩阵

> 状态：编码前冻结
>
> 发布原则：代码硬保证、数据安全或恢复P0失败时禁止发布。

## 1. 主要风险

| 风险                         | 触发信号                     | 预防与检测                                   | 回滚/降级                               | 必测                       |
| ---------------------------- | ---------------------------- | -------------------------------------------- | --------------------------------------- | -------------------------- |
| 单任务范围大导致跨层断裂     | Schema/IPC/UI单层悬空        | 检查点纵向完成、阶段审计、Draft PR持续复查   | 撤回未完成入口，回到最近可运行提交      | Boundary、Integration、E2E |
| Generation终态与结果孤立     | succeeded无结果或结果无Run   | 同事务ResultRef、不变量查询                  | 标记Run failed，保留诊断和可裁决partial | 故障注入、重启             |
| 取消后仍出现delta            | Abort后sequence继续增长      | AbortController、清空pending batch、事件游标 | 关闭订阅并以真实Run状态重载             | ≤500ms取消、零未来delta    |
| Skeleton进入正文             | Preview/Apply接受Skeleton    | 判别联合、DB Trigger、Core Guard             | 拒绝命令，不修改Draft                   | Security、Integration、E2E |
| StateProposal越权写状态      | Provider直接更新权威表       | Batch只生成pending、复用M3-06裁决事务        | 删除失败批次或保留pending，不更新快照   | 零权威写入                 |
| Candidate采用回归            | Lock/Revision/Hash遗漏       | 复用M2-03唯一Apply服务                       | 事务回滚和已有Checkpoint/Undo           | 冲突、重启撤销             |
| ModelSupport枚举分裂         | `untested/unverified`双写    | 兼容读、单一规范写、Fixture迁移测试          | 降级文本模式并显示未验证提示            | Unit、Eval                 |
| Search展示派生脏数据         | FTS内容与权威表不一致        | 只返回ID并权威回读                           | 标记stale、短词/有界回退或重建          | 索引损坏、跨项目           |
| ReplacePlan静默覆盖          | Revision/Hash/命中范围变化   | 提交前全量复核和LockGuard                    | 计划过期，零写入                        | Transaction、Security      |
| mutationOrigin被Renderer伪造 | Renderer传入manual_edit      | Core按命令语义决定来源                       | 拒绝额外字段；无法归类不计人工统计      | 七类来源、安全测试         |
| DOCX压缩炸弹/路径逃逸        | 超限条目、外部关系、符号路径 | 隔离临时目录、大小/数量/比例限制             | 清理临时文件，项目零写入                | 恶意Fixture                |
| 备份配额误删关键点           | 清理最后有效或受保护备份     | 保护规则、删除计划预览、重新验证             | 拒绝清理并返回稳定错误码                | 配额、低空间、最后备份     |
| 凭据或正文进入日志           | 日志扫描命中敏感内容         | PrivacyLogger结构化白名单、自动扫描          | 阻断诊断包/发布，清理测试工件           | Security、日志扫描         |
| Renderer大组件继续膨胀       | 单文件职责和分支显著增加     | 按域拆分hooks/panels，保持状态单源           | 回退该阶段UI入口并重构                  | Unit、Boundary             |
| 大文本阻塞Core               | 连续CPU任务超过100ms         | Worker/分片、性能预算和取消点                | 降级有界预览，禁止无界同步处理          | 5千/2万字、超大项目        |
| 跨平台无法实测               | 缺少目标Runner/签名条件      | CI矩阵与真实工件记录                         | 明确Blocked并给出发布结论               | Windows/macOS/Linux        |

## 2. Migration回滚

1. 每次升级前使用现有RecoveryService创建并验证重大操作恢复点。
2. SQL Migration在`BEGIN IMMEDIATE`事务内完成；失败由现有Migration Runtime回滚。
3. 表重建使用`__new`表、明确字段映射、行数/外键/Hash校验后替换。
4. Migration不执行网络、AI或不可重复推断。
5. 派生数据只标记stale并在升级后重建。
6. 升级后`quick_check`、`foreign_key_check`或关键查询失败时停止写入并进入只读恢复。
7. 不提供向下Migration；退回旧版本时恢复升级前备份。

## 3. 检查点测试路由

| 检查点 | 必跑测试                                                | 专项证据                              |
| ------ | ------------------------------------------------------- | ------------------------------------- |
| C0     | task status/validate、文档链接与Evidence校验            | 规划提交和Draft PR                    |
| C1     | Unit、Integration、Migration、Security、Electron E2E    | 五分钟项目、继续写作、只读入口        |
| C2     | Unit、Integration、Migration、Security、E2E、Eval、Perf | Run事务、取消、partial、重启、日志    |
| C3     | Unit、Integration、Security、E2E、Eval                  | T0多方案、T1三来源、Skeleton零Apply   |
| C4     | Unit、Integration、Security、E2E、Diff Perf             | 改写锚点、融合映射、冲突和撤销        |
| C5     | Unit、Integration、Migration、Security、E2E、Eval       | Provider Batch、零权威写入、稳定Issue |
| C6     | Unit、Integration、Migration、Security、E2E、Perf       | FTS、ReplacePlan、七类来源、黄金三章  |
| C7     | Unit、Integration、Migration、Security、E2E、Perf       | 恶意DOCX、三轨备份、配额和恢复        |
| C8     | 全量命令、跨平台构建、真实Electron、人工UI              | P0矩阵、安全/性能/发布报告            |

## 4. 最终命令矩阵

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm check:boundaries
pnpm task:validate
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:security
pnpm test:e2e
pnpm test:eval
pnpm test:perf
pnpm test:coverage
pnpm test:quality
pnpm build
pnpm package
pnpm release:check
```

跨平台阶段增加Windows、macOS、Linux构建、安装/升级/卸载、原生SQLite、窗口/DPI和安全降级命令。

## 5. PR与发布判断

- 长期PR在C0后保持Draft。
- 每个检查点更新PR说明、受影响矩阵和已运行命令，禁止用后续阶段计划冒充完成。
- 任何代码硬保证、数据安全或恢复P0失败：禁止发布。
- 非安全类平台项因客观环境无法验证：记录Blocked、影响和解除条件，输出有条件允许或禁止发布。
- 最终Evidence只绑定Ready前最后受检Head；Head变化后重跑受影响矩阵。
