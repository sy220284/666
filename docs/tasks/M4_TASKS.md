# WorldForge M4 检索与AI基础设施任务摘要

> 状态：Frozen  
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

建立FTS、约束包、Provider、Prompt和GenerationRun等可复用AI基础设施。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M4-01 | [FTS5公共索引、队列与项目词典](M4/M4-01_FTS_INDEX_DICTIONARY.md) | M3 | 建立AI约束召回和用户全项目搜索共用的FTS5基础，不重复建设索引逻辑。 |
| M4-02 | [P0—P4约束包与裁剪追溯](M4/M4-02_CONSTRAINT_PACKAGE.md) | M4-01、M3-06 | 为每类AI任务组装可追溯、符合时序、可裁剪的上下文包。 |
| M4-03 | [Provider、凭据与连接测试](M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md) | M3、M0-02、M0-04、M0-05 | 安全连接外部API和用户已运行的本地兼容服务，统一认证、流式、取消和错误处理。 |
| M4-04 | [Prompt Registry、输出Schema与Cleaner](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md) | M4-02、M4-03 | 建立生产级版本化Prompt、输入输出Schema、构建器、解析器和受控清理规则。 |
| M4-05 | [GenerationRun、流式运行与模型支持档案](M4/M4-05_GENERATION_RUNTIME_EVAL.md) | M4-04、M0-07 | 建立真实AI任务运行时、持久化状态、取消、partial结果、模型支持档案和Eval闭环。 |

## 阶段退出门

- FTS、约束包、Provider、Prompt和GenerationRun形成稳定公共基础。
- AI不可用时M1—M3功能完整可用。
- 模型支持等级和Eval可追溯到Provider+Model+Task+PromptVersion。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
