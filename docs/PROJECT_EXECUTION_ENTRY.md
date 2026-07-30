# WorldForge 项目执行统一入口

> 状态：Active  
> 面向：Codex、开发者、审查者、测试人员

## 1. 启动顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ 当前活动任务卡
→ TASK_INDEX列出的依赖与吸收来源
→ 权威规格、现有代码、测试、Migration、IPC与Evidence
```

`ACTIVE_TASK.json`是机器可读真源，`ACTIVE_TASK.md`是生成镜像，`TASK_INDEX.md`是任务状态和归属真源。

## 2. 当前分阶段交付

M4-04、M8-02和M8-04已经完成V1.0核心功能、自用便携交付、作者体验改造和最终验证。当前独立维护任务M8-05处理后续审计确认的运行时缺陷与文档漂移：

```text
M4-04、M8-02、M8-04 Verified基线
→ M8-05搜索工具异步隔离
→ Provider响应超限错误语义收敛
→ 任务、契约、安全、UI与验收文档统一
→ PR永久门禁
→ 受控合并main
→ Main Verification
→ M8-05 Verified关闭
```

M8-05复用既有权威数据、服务、保存序号、内容校验、锁定、只读与恢复机制，不建立第二套产品、搜索数据或界面数据真源。

## 3. 当前执行模式

```text
活动任务：M8-05
正式分支：work/m8-05-runtime-hardening-documentation-sync
授权模式：implementation-pr
自动激活下一任务：关闭
前置任务：M8-04（Verified）
```

M8-05使用独立正式分支与单一正式PR完成实现、测试、文档和验证记录汇合。只有Ready永久门禁和合并后Main Verification均成功，才能关闭为Verified。

## 4. 权威顺序

```text
作者最新明确指令
> ACTIVE_TASK与TASK_INDEX
> 当前任务卡
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> 冻结专项规格、ADR、Schema、契约、UI、安全与P0验收
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> 现有实现
```

发现冲突时必须记录冲突来源、数据兼容、影响范围和解决方案，禁止静默选择。

## 5. 当前任务边界

### M8-05：运行时硬化与文档统一同步

- 搜索、替换、作品词典和全文索引使用独立请求通道与独立等待状态。
- 同一通道旧响应失效，不同通道互不错误取消；作品切换统一失效全部旧请求。
- Provider总响应和单个SSE事件继续受资源上限保护。
- 超限使用独立`AI_RESPONSE_TOO_LARGE_014`，不再复用结构解析失败语义。
- 同步任务体系、产品规格、IPC、错误码、Provider、安全、UI、测试、README和CHANGELOG。
- 不修改数据库Schema、历史Migration和自用发布边界。

Evidence：`docs/test-evidence/M8-05/`。

## 6. 标准实施闭环

```text
读取任务卡、专项真源与现有实现
→ 建立稳定复现或失败测试
→ 最小完整代码修复
→ Contracts / Core / Renderer按影响同步
→ 单元、集成、安全、性能与E2E回归
→ 更新任务、追踪、专项文档和Evidence
→ Draft转Ready
→ 六项永久门禁全部成功
→ 使用expected_head_sha受控合并
→ 等待main-verification成功
→ 关闭任务为Verified
```

任何一个步骤未完成，不得报告“合并完成”或“main已通过”。

## 7. 强制规则

- 不修改已Verified任务卡、历史Migration和历史Evidence Manifest。
- 不建立第二套Prompt、TaskProtocol、Candidate采用、导入、恢复、模式、主题或搜索数据真源。
- 每项代码修改按实际影响完成Contracts→Core→Renderer→测试闭环。
- 未接通能力不得显示可用，不得写入半成品权威数据。
- AI输出不得绕过Candidate或StateProposal进入权威数据。
- 无AI写作、保存、Version、导出和恢复始终必须可用。
- 测试、构建、发布和平台结论必须来自真实运行。
- PR Head检查成功不等于main验证成功；合并后必须复核最终main SHA及`main-verification`。
