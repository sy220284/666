# M0-07 AI输出协议与中文Diff Spike结论

> 状态：Implemented；`main`实现基线的 Task Governance 与 Quality 门禁均通过
> 适用范围：M4 Provider/Prompt/GenerationRun与M5 Candidate生成、审阅和Diff

实现基线：`9b10fdb2f07124ef2491198aacc39d08bc69305b`。远端证据：[Task Governance](https://github.com/sy220284/666/actions/runs/29473622555)、[Quality](https://github.com/sy220284/666/actions/runs/29473622578)。

## 1. 采用与降级决策

| 场景 | 决策 | 失败/降级 |
|---|---|---|
| T0骨架 | 采用strict结构化输出；每个倾向生成独立Candidate；最终Zod Schema再次校验 | 只允许一次已登记JSON代码围栏去壳；截断JSON、Schema错误或缺少必选beatId返回`AI_OUTPUT_INVALID_008`，允许作者绕过T0 |
| T1章节 | 默认纯文本流，完成后清理登记外壳；结构化Block仅对Prompt版本匹配、状态verified且`structuredSchemaRate=1`的ModelSupportProfile开放 | Profile缺失、limited/untested、版本不匹配或结构稳定率不足时自动降级为文本流 |
| Provider故障 | 正常、中文分片、断流、无效JSON、超时、限流和取消使用统一错误语义 | 断流且已有文本标记partial；取消保留已接收文本但不冒充complete；超时/限流保持稳定错误码 |
| Cleaner | 只清理精确登记的代码围栏、首行“以下是正文”和末行“本章完” | 相似短语出现在正文内部时原样保留；禁止补括号、猜字段或改写内容来通过Schema |
| 模型支持 | 支持等级绑定Provider + Model + Task + PromptVersion + FixtureSet | `deterministic-stub`档案只验证协议，不传播到真实Provider或真实模型 |

## 2. Diff决策

结构层先按`logicalBlockId`和显式`sourceLogicalBlockIds`匹配，再以最长递增子序列识别移动，覆盖新增、删除、移动、拆分、合并和修改。重复ID、未知来源或同一来源参与多个结构组会直接拒绝，避免猜测对应关系。

块内文本使用Unicode code point、公共前后缀和有界Myers字符Diff。编辑距离超过2048、工作量超过5,000,000单元，或低重合中段达到250,000字符乘积时，退化为可重建的整段删除/插入，不以长时间阻塞换取伪精确结果。

| 章节规模 | 执行策略 | 冻结门槛 |
|---|---|---|
| ≤5,000字 | 主线程：先结构、后有界字符Diff | 首屏≤500ms；完整≤1.2s；连续阻塞<100ms |
| 5,001—20,000字 | 按块渐进分片，块间让出执行权并检查取消 | 首屏≤1.2s；完整≤3s；取消≤500ms |
| >20,000字 | Worker | 主线程只接收分片结果；M2/M5接入Candidate UI时实现Worker适配器 |

## 3. 本地量化结果

环境：Linux 6.12.47，Node 24.14.0，Intel Xeon Platinum 8370C，15.93GB内存；公开合成中文Fixture。下表为实现构建后的诊断基准，不含模型网络时间。

| 指标 | 样本 | P95/结果 | 预算 | 结论 |
|---|---:|---:|---:|---|
| 5,000字结构首屏 | 100 | 0.116ms | 500ms | 通过 |
| 5,000字完整Diff | 100 | 1.054ms（最大1.436ms） | 1,200ms | 通过 |
| 20,000字渐进完整Diff | 25 | 1.266ms（最大1.536ms） | 3,000ms | 通过 |
| 20,000字最大单分片 | 25 | 0.542ms | 100ms | 通过 |
| 20,000字取消确认 | 1 | 0.231ms | 500ms | 通过 |

性能测试同时覆盖短中文重复字符的全组合重建、Emoji code point、低重合粗粒度回退与取消前不再产生后续字符结果。

## 4. Eval基线

`m0-07-v1`登记公开合成T0骨架、结构围栏、连续性与知识边界Fixture。最小报告位于`evals/reports/deterministic-stub/deterministic-v1/skeleton/1/`，包含summary、逐Fixture结果、环境和人工复核；ModelSupportProfile样例位于`evals/model-support/`。

确定性报告达到Schema有效率100%、必选Beat覆盖100%、禁止事件泄露0%和最多一次登记修复。它只验证协议回归；真实模型质量Eval、生产Provider、GenerationRun持久化、Candidate UI与Worker接入仍由M4、M5和M8完成。
