# WorldForge 发布资格判定规范

> 状态：Active  
> 适用范围：V1.0自用便携包的GitHub Release手工发布。

## 1. 核心原则

发布资格属于当前`main`的整体有效状态。任何独立维护任务进入任务索引后，在其完成受控合并、Main Verification、任务状态发布和Evidence绑定前，发布门必须保持阻断。

发布门读取：

```text
package.json
TASK_AUTHORIZATION.json
TASK_INDEX.md
docs/tasks/runtime/*.json
当前发布提交的GitHub Commit Status
release.yml
```

`ACTIVE_TASK.json/.md`已经退役，不再参与发布资格。

## 2. 必须同时满足的条件

### 2.1 版本与分支

- 请求版本必须是严格SemVer且与`package.json`一致。
- Release只能从`main`手工触发。
- 发布工作流的资格检查与发布前复核必须读取当前提交状态。

### 2.2 任务终态

- `TASK_INDEX.md`中的每张独立任务必须有对应Runtime，或属于冻结历史任务且索引明确为Verified。
- `releaseBlocking !== false`的Runtime必须存在于独立任务索引。
- Schema 2 Runtime为`IMPLEMENTED`时，只有对应`task-verification/<TASK-ID>`在当前发布提交上成功，才计算为有效Verified。
- 冻结历史Schema 1 Runtime的静态Verified记录继续只读接受，不允许作为新活动任务格式。
- 任一In Progress、Implemented但未验证、Blocked或缺少状态绑定的任务都会阻断发布。

### 2.3 提交状态

- 当前发布提交必须拥有成功的`main-verification`。
- 每个当前模型下的releaseBlocking任务必须拥有成功的任务验证状态，或具备冻结历史Verified记录。
- 状态必须属于当前发布提交，不得沿用其他分支或旧Head。

### 2.4 索引完整性

- 独立任务索引不能为空。
- releaseBlocking Runtime不得游离于索引之外。
- 被吸收需求来源不参与独立任务终态计算。
- 新增任务时发布工具不得依赖固定任务编号，应通过索引和Runtime自动发现。

## 3. 典型阻断场景

| 场景 | 结果 |
|---|---|
| 索引含M10-04，但Runtime仍In Progress | 阻断 |
| Runtime为Implemented，但任务验证状态缺失 | 阻断 |
| 任务验证成功，但状态属于其他提交 | 阻断 |
| releaseBlocking Runtime未登记到任务索引 | 阻断 |
| 请求版本与`package.json`不一致 | 阻断 |
| 非main触发Release | 阻断 |
| 全部任务有效Verified且版本、分支正确 | 放行 |

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

当前发布仅供仓库所有者本人使用：Windows、macOS、Linux便携包；不包含代码签名、公证、系统安装器和自动更新；不声明适合第三方公开分发；作品数据、数据库和备份继续与应用程序目录分离。

## 6. 维护规则

1. 新增独立任务时，不修改发布工具中的固定任务编号。
2. 新任务登记后，发布门自动因任务未有效Verified而阻断。
3. Main Verification成功并发布任务验证状态后，发布资格自动恢复。
4. 发布资格逻辑变化必须同步单元测试、本规范、开发自动化规范和任务Evidence。
5. 不得恢复以兼容锚点或手工文本作为发布资格真源的旧设计。
