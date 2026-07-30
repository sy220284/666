# WorldForge 发布资格判定规范

> 状态：Active  
> 适用范围：V1.0自用便携包的GitHub Release手工发布。

## 1. 核心原则

发布资格属于仓库整体终态，不属于某一张固定任务卡。任何后续独立维护任务进入`main`后，必须完成实现、受控合并、Main Verification、Evidence绑定和最终Verified关闭，发布门才可重新放行。

发布门同时读取：

```text
package.json
TASK_INDEX.md
ACTIVE_TASK.json
当前发布提交的Git历史
release.yml
```

## 2. 必须同时满足的条件

### 2.1 版本与分支

- 请求版本必须是严格SemVer且与`package.json`一致。
- Release只能从`main`手工触发。
- 发布工作流的资格检查与发布前复核都必须获取完整Git历史。

### 2.2 任务终态

- `TASK_INDEX.md`中全部独立任务均为`Verified`。
- `ACTIVE_TASK.activeTask.status`必须为`VERIFIED_HOLD`。
- `activeTask.id`、`verificationHold.taskId`和`lastVerifiedTask.id`必须一致。
- `verificationHold.finalTask=true`且`nextTaskId=null`。
- `verificationHold.verifiedTasks`必须无重复，并与任务索引中的全部独立任务精确一致。

### 2.3 延期账本

以下账本必须为空：

```text
deferredVerification
deferredTasks
```

任何延期验证、暂停任务或尚未关闭的后续维护任务都会阻断发布。

### 2.4 受检提交可达性

- `lastVerifiedTask.commit`必须是当前发布提交的可达祖先。
- `lastVerifiedTask.evidenceHead`必须是当前发布提交的可达祖先。
- 允许受检产品提交之后存在合法的治理关闭提交。
- 不允许引用来自其他分支、已重写历史或当前发布提交不可达的Evidence来源。

## 3. 典型阻断场景

| 场景 | 结果 |
|---|---|
| M8-02已Verified，但后续M8-05为Implemented | 阻断 |
| 全部任务Verified，但`deferredVerification`非空 | 阻断 |
| 任务索引全部Verified，但活动状态不是`VERIFIED_HOLD` | 阻断 |
| 最终保持任务与最近验证任务不一致 | 阻断 |
| 最终保持清单漏掉任务或包含不存在的任务 | 阻断 |
| Evidence提交不是当前发布提交祖先 | 阻断 |
| 全部终态条件满足且版本、分支正确 | 放行 |

## 4. 发布流程

```text
手工触发Release
→ 完整Quality、Security与Performance
→ 动态发布资格门
→ Linux、Windows、macOS构建与启动冒烟
→ 发布前再次执行动态资格门
→ 生成SHA-256校验和
→ 创建不可变GitHub Release
```

发布门只判断资格，不替代完整质量、安全、性能和三平台构建。

## 5. 交付边界

当前发布仅供仓库所有者本人使用：

- Windows、macOS、Linux便携包；
- 不包含代码签名、公证、系统安装器和自动更新；
- 不声明适合第三方公开分发；
- 作品数据、数据库和备份继续与应用程序目录分离。

## 6. 维护规则

1. 新增独立任务时，不需要修改发布工具中的固定任务编号。
2. 新任务激活后，发布门应自动因任务未Verified和非最终保持状态而阻断。
3. 新任务治理关闭后，只有任务索引、最终保持、延期账本和提交可达性全部一致，发布门才恢复放行。
4. 发布资格逻辑变化必须同步单元测试、本规范、开发自动化规范和任务Evidence。
