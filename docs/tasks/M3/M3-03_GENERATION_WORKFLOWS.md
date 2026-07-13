# M3-03 T0/T1、快速改写、融合与取消

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m3-generation-workflows`

## 目标

完成可选、可取消、可降级的AI生成工作流，并保证所有输出先进入Candidate。

## 依赖

M3-01、M3-02、M0-04。

## 关联

- 需求：REQ-026—REQ-028
- 验收：P0-023—P0-028

## 必读文档

- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`

## 实施内容

1. GenerationRun和requestId幂等。
2. T0结构化骨架多Candidate。
3. T1基于选定骨架生成完整Candidate。
4. 快速改写：单段内联预览、换一个、取消、应用和撤销。
5. 结构性改写：跨段、跨场景和整章进入完整Candidate。
6. 融合：BeatSourceMapping和必要过渡修补。
7. 真实stage事件、字符数、耗时、取消和partial Candidate。
8. Prompt Registry、结构化输出和Cleaner规则接通。

## 安全

- 流式文本不直接写Draft。
- 快速改写同样执行LockGuard、Revision和来源标记。
- 无法可靠判断轻量范围时升级结构性流程。

## 测试

切章续跑、多任务并行、取消、断流、无效JSON、格式修复失败、骨架遗漏、partial Candidate和重启后Run状态。

## 完成条件

T0/T1可绕过；任何失败不改变Draft；AI任务阶段与真实程序状态一致；取消后无未来正文delta。
