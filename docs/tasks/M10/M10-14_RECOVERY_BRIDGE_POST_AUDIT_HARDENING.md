# M10-14 Recovery、Bridge与边界审计收口

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作 / V1.5 Preflight  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 来源 PR：`#323`  
> 主线基线：`d394d89766d2e85889c81f9599378e958681f3c0`  
> 实施提交：`10757c2c25a377f902276d6bbaa13d3db670c5af`

## 目标

根据 M10-13 合并后的全量代码 Review，修复剩余 Recovery fail-closed、每日备份并发、Renderer Bridge 共享读取取消语义、Provider IPv6 特殊地址分类与高风险生命周期覆盖盲区，保持已验证的数据、Migration、Generation 与安全内核不变。

## 已确认根因

1. Recovery 清理读取保留策略失败时仍可能退回默认策略，删除类操作缺少严格 fail-closed 前置条件；
2. Daily Backup 的跨实例去重主要依赖文件锁陈旧判断，合法长备份存在锁接管竞态；正式桌面应用已有单实例约束，应在 Recovery 公共服务层增加同进程、同项目、同日期共享所有权；
3. `BridgeRequestCoordinator` 的 `share` 模式共享底层请求时丢失调用方 `AbortSignal`，消费者不能独立退出等待；
4. Provider IPv6 分类遗漏已废弃的 `FEC0::/10` site-local 地址段；
5. `request-lifecycle.ts` 属于纯异步核心逻辑，却仍被 Coverage 排除，高风险公共机制缺少直接覆盖门禁。

## 实施原则

- 保留 SQLite、Migration、单写队列、Recovery 备份/恢复业务内核、Provider DNS Pinning 和 GenerationRun；
- 在公共入口修复状态所有权和 fail-closed，不复制平行业务逻辑；
- Daily Backup 复用桌面单实例不变量，在 Recovery Service 层按备份根目录、项目、日期共享在途操作；底层文件锁继续承担崩溃残留协调；
- `share` 使用“共享底层请求 + 消费者独立取消”，只有最后一个消费者退出时才取消底层等待；
- 不降低 Coverage 阈值，不新增排除，不增加生产依赖，不修改 Migration 或锁文件。

## 完成结果

- Recovery 清理入口在读取/解析持久化策略失败时 fail-closed，预览和执行均拒绝继续；
- Recovery Overview 在可写数据库下预检真实失败记录、版本与策略查询，详细读取故障不再伪装为空数据；
- Daily Backup 在 Recovery 公共服务层按备份根目录、项目和日期共享在途操作，两个服务实例不会重复启动同日真实备份；
- Bridge `share` 改为共享底层请求、消费者独立取消，单个消费者退出不误杀其他调用方，最后一个消费者退出后中止底层等待；
- Provider IPv6 分类阻断 `FEC0::/10` 已废弃 Site-Local 地址；
- `request-lifecycle.ts` 从 Coverage 排除中移除，并增加共享读取取消行为测试；
- 增加 Recovery 长备份跨实例共享、策略读取失败关闭和 Provider IPv6 安全回归测试。

## 验收范围

- Recovery 清理在保留策略表读取或解析失败时拒绝预览与执行；
- Recovery Overview 的可写数据库详细查询失败不得伪装为空数据；
- 两个 Recovery Service 实例同时发起同日备份只执行一次真实备份；
- Bridge `share` 两个消费者共享一次调用，单个消费者取消不影响另一个；全部消费者取消时底层请求失效；
- `FEC0::/10` Provider 地址被拒绝；
- `request-lifecycle.ts` 进入 V8 Coverage 分母，并由直接行为测试覆盖；
- 全量静态、Unit、Integration、Migration、Coverage、Security、Performance、Build 与 Electron E2E 不回退。

## 非目标

- 不重写 Recovery 文件格式、三轨备份模型或恢复副本流程；
- 不修改产品功能范围、UI 信息架构、数据库 Schema 或已发布 Migration；
- 不以文件行数触发拆分；
- 不为通过测试扩大白名单、降低阈值或吞掉错误。

## 完成条件

- [x] 根因修复完成；
- [x] 回归测试覆盖成功、失败、取消和并发；
- [x] Coverage 排除收紧且静态门禁通过；
- [ ] 全量代码复核无新增 P0/P1；
- [ ] Ready Evidence 绑定最终实施提交；
- [ ] Controlled Merge、Main Verification 与任务验证完成；
- [ ] `work` 受控同步至最新 `main`。
