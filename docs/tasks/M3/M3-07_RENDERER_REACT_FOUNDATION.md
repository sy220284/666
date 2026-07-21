# M3-07 Renderer迁移基础与React底座

> 状态：Deferred  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 原机器分支：`work/m3-07-renderer-react-foundation`  
> Checkpoint：`3522f2887da4c74fcf5de3a57aa87337fb270276`（PR #125）  
> 承接任务：`M3-08`

## 状态说明

作者决定跳过M3-07的独立闭环，继续推进下一任务。M3-07不得登记为Implemented或Verified；已完成部分保留为Renderer迁移Checkpoint，未完成范围全部并入M3-08统一完成。

本卡不再作为独立活动任务执行。Issue #126继续记录被转移的环境与验收事项。

## 已完成并进入main

- Bridge请求生命周期：取消、重复提交阻断、replace代次与陈旧响应丢弃。
- 具名Renderer Bridge Adapter。
- P0—P3状态仲裁。
- 生命周期注册表。
- 旧Renderer单实例兼容加载器。
- Renderer Foundation启动编排与Core健康检查。
- 临时UI状态白名单模型。
- Legacy所有权与退役任务清单。
- 对应Unit与Security边界测试。

## 转入M3-08的未完成范围

- React、ReactDOM、Zustand及类型依赖。
- pnpm 11.13.0生成的规范`pnpm-lock.yaml`。
- TSX配置与唯一真实`react-entry.tsx`。
- `createRoot`、React错误边界与P0启动诊断界面。
- Zustand正式Store接线及无持久化约束。
- React与Legacy DOM所有权隔离。
- 完整Unit、Integration、Migration、Security、Performance、Build、Electron E2E与Package复验。
- M3-07正式Evidence。

## 后续关闭规则

1. M3-08必须完成本卡全部转入范围，不能只迁移页面。
2. M3-08 Evidence必须单独列出M3-07转入要求及真实测试结果。
3. M3-08完成后，使用`pnpm task:close-deferred M3-07 -- --evidence-task=M3-08 ...`校验承接关系、Evidence、主线提交与Squash来源后，将本卡从Deferred登记为Verified。
4. 在上述条件满足前，M3阶段不得关闭，M4-01不得激活。
