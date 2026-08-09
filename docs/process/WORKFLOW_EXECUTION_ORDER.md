# WorldForge 工作流执行顺序

> 状态：Active  
> 分支模型：`single-work-pr`

## 标准顺序

```text
核对任务、依赖、范围与最新main
→ 确认work与已验证main一致
→ 在唯一work实施、测试、文档和Evidence
→ 更新唯一work → main PR
→ Draft持续执行永久检查
→ Runtime登记IMPLEMENTED与来源PR/Head绑定
→ Ready Head六项永久门禁成功
→ 使用expected_head_sha串行Controlled Merge
→ 等待Main Verification成功
→ 发布任务验证提交状态
→ 任务有效状态转为VERIFIED
→ Work Synchronization安全重置work到已验证main
→ 重新读取main、work、Runtime与提交状态
```

禁止独立正式分支、验证分支、治理关闭分支、纯Evidence分支和第二个关闭PR。

## 状态边界

不得混淆：

- Draft检查成功：当前Head通过反馈门，不具备合并资格。
- Ready检查成功：当前Head具备受控合并资格。
- PR已合并：GitHub完成Squash，尚未证明最终main有效。
- Main Verification成功：最终main SHA、来源PR和永久门禁一致。
- 任务验证状态成功：任务Runtime绑定与最终main闭环，计算状态为Verified。
- Work Synchronization成功：work在无新提交、无新PR条件下与已验证main重新一致。

只有最后一项完成并重新读取真实分支后，才能声明主线闭环。

## 任务状态

```text
PLANNED
→ IN_PROGRESS
→ IMPLEMENTED
→ VERIFICATION_PENDING（计算）
→ VERIFIED（计算）
```

- `IMPLEMENTED`由PR Head中的Runtime声明。
- `VERIFICATION_PENDING`表示尚无匹配的任务验证成功状态。
- `VERIFIED`要求任务ID、来源PR、来源work Head、最终main SHA和任务验证状态完全一致。
- `VERIFIED_HOLD`表示当前没有自动激活的后续任务。

## 分支与并行规则

- 仓库只允许`main`和`work`。
- 所有正式PR必须精确为`work → main`。
- 同一时刻最多一个开放正式PR。
- 并行工作只能通过本地工作区、文件所有权和提交顺序协调，最终统一进入`work`。
- main写入、Main Verification、任务关闭和work同步始终串行。
- 共享入口、锁文件、任务状态和Evidence Manifest必须串行集成。

## 失败处理

任何门禁或同步失败：

```text
停止合并或同步
→ 定位真实原因
→ 在同一work修复
→ 重跑受影响检查和永久门禁
→ 更新Runtime、Evidence与风险说明
```

禁止跳过失败检查、缩小验证范围、复用其他Head的Evidence、强行覆盖已移动的work或手工改写成功结论。
