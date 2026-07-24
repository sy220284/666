# 全量测试质量整改（2026-07-24）

## 目标

本次整改覆盖仓库全部测试文件及测试基础设施，重点提升以下能力：

- 测试真实性：禁止空断言、恒通过合同和只为执行代码而存在的测试；
- 断言精度：路由、IPC和桥接层验证精确操作、参数、顺序和结果；
- 类型安全：消除无约束 `as never`，非法输入必须通过命名边界显式构造；
- 隔离性：测试替身访问未声明成员时立即失败，避免宽松Mock掩盖接口漂移；
- 可维护性：建立永久静态审计与可复用严格测试工具；
- 回归价值：保留真实数据库、事务、重启、DOM、Editor和跨层集成测试优势。

本次不修改任何产品行为，也不修改活动任务 M4-01 的状态、范围或实现。

## 初始审计结果

全仓扫描确认不存在已提交的跳过测试、聚焦测试和空测试体。主要质量债务为：

| 问题 | 初始数量 | 风险 |
|---|---:|---|
| 无约束 `as never` | 61 | 生产接口变化后测试可能继续编译，夹具失去类型回归能力 |
| 恒通过结果Schema | 6 | 非法返回结构可能被测试放行 |
| 弱IPC表面数量断言 | 1 | 只验证Handler数量，无法发现通道缺失或错误映射 |
| 全仓测试质量永久门禁 | 0 | 相同问题可再次进入仓库 |

这些问题主要分布在 Electron Main、Preload、IPC、Core路由、Editor和Renderer测试。

## 已实施整改

### 1. 永久测试质量审计

新增 `scripts/test-quality-audit.mjs`，并通过 `tests/unit/test-quality-audit.test.ts` 纳入正式单元测试。审计器会阻止：

- `it.only`、`it.skip`、`it.todo`及对应 `test`、`describe`变体；
- 字面量恒真/恒假断言；
- 空测试体；
- 返回输入原值的Schema Mock；
- 仅以Handler数量下限证明IPC完整性的断言；
- 测试文件无测试用例或无显式断言；
- 未登记或新增的无约束 `as never`。

`tests/test-quality-baseline.json`采用精确匹配策略：当前允许数量为零，后续任何新增类型逃逸都会导致门禁失败。

### 2. 严格测试替身

新增：

- `tests/testkit/strict-test-doubles.ts`
- `tests/testkit/strict-result-envelope.ts`
- `tests/unit/strict-testkit.test.ts`

严格替身具备以下行为：

- 保留Getter、方法和属性描述符；
- 访问或写入未声明成员立即抛错；
- 不会被Promise机制误识别为Thenable；
- 非法合同输入必须通过 `contractInput<T>()` 明确标注；
- Core结果信封必须具备精确字段、必需数据和合法成功/失败结构。

### 3. 路由和IPC测试强化

Core路由测试由“调用成功或operation相同”升级为：

- 每个operation映射到唯一服务方法；
- 参数列表逐项相等；
- 路由顺序和短路行为精确校验；
- 破坏性操作的校验、Checkpoint和执行顺序固定；
- 成功结果的data与实际服务返回一致；
- 未知operation不得触碰任何服务。

IPC测试由Handler数量下限升级为完整生产通道集合相等，并验证卸载集合对称。真实表面矩阵同时验证每个通道对应的App Data或Project operation及参数。

### 4. 跨层、Editor和Renderer测试强化

- Preload—IPC—Core集成测试使用严格IPC Main、Supervisor、Credential Broker和Core运行时替身；
- Preload非法输入改为显式合同边界，不再隐藏在 `as never` 中；
- Editor文档、锁保护、组合输入和元数据同步测试使用正式参数类型；
- Core恢复监督器与默认DOM面使用严格桥接替身；
- Renderer工作台和权威状态非法输入均使用命名边界；
- Core错误映射矩阵使用显式错误构造器类型。

## 最终质量约束

整改完成后，仓库测试体系应同时满足：

1. 全量测试质量审计通过；
2. 无恒通过Schema；
3. 无弱Handler数量断言；
4. 无未登记 `as never`，当前基线为零；
5. 格式、Lint、Typecheck通过；
6. 单元、集成、迁移、性能、安全、覆盖率和Electron E2E通过；
7. 产品源码四项覆盖率继续不低于75%；
8. 工作区在测试前后保持清洁；
9. M4-01活动任务状态与基线一致。

## 后续维护原则

新增测试优先采用以下顺序：

1. 真实Service、SQLite、临时工作区或正式公共API；
2. 严格类型化测试替身；
3. 精确结果、参数和副作用断言；
4. 异常、并发、重启、取消和迟到结果测试；
5. 仅在无法直接构造正式类型时使用 `contractInput<T>()`，并明确表达其为故意非法输入。

禁止通过放宽Schema、扩大类型逃逸基线或降低覆盖率阈值解决测试失败。
