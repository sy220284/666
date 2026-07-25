# WorldForge M4 检索与AI基础设施任务摘要

> 状态：Frozen
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

建立FTS、约束包、Provider、生产Prompt和GenerationRun等可复用AI基础设施，并承接M0既有TaskProtocol、ProviderStub和Prompt Spike，禁止重复建设。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M4-01 | [FTS5公共索引、队列与项目词典](M4/M4-01_FTS_INDEX_DICTIONARY.md) | M3 | 建立AI约束召回和用户全项目搜索共用的FTS5基础，不重复建设索引逻辑。 |
| M4-02 | [P0—P4约束包与裁剪追溯](M4/M4-02_CONSTRAINT_PACKAGE.md) | M4-01、M3-06 | 为每类AI任务组装可追溯、符合时序、可裁剪的上下文包。 |
| M4-03 | [Provider、凭据与连接测试](M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md) | M3、M0-02、M0-04、M0-05 | 安全连接外部API和用户已运行的本地兼容服务，统一认证、流式、取消和错误处理。 |
| M4-04 | [Prompt Registry、输出Schema与Cleaner](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md) | M4-02、M4-03、M0-07 | 在现有Spike基础上生产化Prompt版本、互斥T1三来源、state_extract合同、Parser和Cleaner。 |
| M4-05 | [GenerationRun、流式运行与模型支持档案](M4/M4-05_GENERATION_RUNTIME_EVAL.md) | M4-04、M4-03、M0-04、M0-07 | 复用TaskProtocol建立GenerationRun持久化、通用结果引用、生产Prose Candidate收口、partial处理和模型支持档案。 |

## 阶段退出门

- FTS、约束包、Provider、Prompt和GenerationRun形成稳定公共基础。
- M4-04真实承接M0-07资产，不存在第二套Registry、Cleaner或Parser。
- T1三种输入来源在合同层互斥且完备，零来源和多来源均被拒绝。
- M4-05真实承接TaskProtocol，不存在第二套AI任务状态机。
- GenerationResultRef可区分Candidate与StateProposal批次，旧Candidate事件保持兼容。
- Run、结果、Prompt和约束来源引用完整，取消后无未来delta进入Renderer。
- AI不可用时M1—M3功能完整可用。
- 模型支持等级和Eval可追溯到Provider+Model+Task+PromptVersion。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- M4-01—M4-03已完成终验并冻结；作者已取消暂缓指令，M4-04正式激活。
- M4-05不得提前定义Skeleton结构化Payload，骨架语义归M5-01。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
