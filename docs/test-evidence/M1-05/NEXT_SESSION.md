# M1-05 下次续作检查点

日期：2026-07-16
分支：`main`
活动任务：`M1-05_BLOCK_PATCH_REVISION`

## 已完成

- M1-04 实现已发布到远端 `main`：`8719d4f3a477235e5bf65eba9e345a9169e9359e`。
- M1-05 激活提交已发布到远端 `main`：`f5272974a1a38d2e5860a6e6ec0f3186b8aa2383`。
- 远端 `ACTIVE_TASK.json` 已复核为 `M1-05 / IN_PROGRESS / main`。
- 已按强制启动顺序完整读取 AGENTS、执行入口、活动任务、任务卡及全部必读规格。
- 已检查现有 Draft 契约、Core 快照写入、Tiptap 映射、SQLite 事务、迁移、IPC、Renderer、测试和追踪矩阵。
- 本轮没有开始 M1-05 产品代码修改；停下时工作区为干净状态。
- 新鲜基线中 `pnpm test:integration` 通过：8 个测试文件、24 个测试。并行运行的 `test:unit` 与 `test:migration` 输出未收齐终态，下次需单独重跑后再记录。

## 已识别的范围冲突

任务要求所有正文写入统一经过 `draft.applyPatch`，并禁止 Renderer 或 Repository 继续使用无 `baseRevision`、无 `expectedHash` 的快照旁路。当前任务允许路径缺少以下直接受影响范围：

- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/migration/`
- `tests/security/`
- `tests/e2e/`
- `docs/contracts/`
- `docs/database/`
- `docs/ui/`

下次第一步应把这些路径补入任务卡和 `ACTIVE_TASK.json`，运行 `task:sync`、`task:validate` 与 `task:preflight`，然后再写产品代码。

## 下次实施顺序

1. 修正活动任务执行范围，只加入上述与 Patch 入口直接相关的路径。
2. 先添加失败测试：语义标准化与 SHA-256、strict Patch Schema、旧 Revision、Hash 冲突、非法顺序、重复 requestId、单事务回滚、重启无半提交、Patch 日志、编辑器 Patch 生成。
3. 在 Domain 建立唯一语义标准化函数：统一换行和 Unicode NFC，保留有意义空白，规范 headingLevel，并把 blockType 纳入语义序列化。
4. 用 `draft.applyPatch` 替换 `draft.saveSnapshot`；公开操作严格遵循 DEC-004 的 insert/update/delete/move，不扩展冻结操作格式。
5. 新增 project migration `0004`，建立带 requestId 幂等约束的 `draft_patch_log`；旧 DraftBlock Hash 在受控 Core 写事务中初始化。
6. Core 在内存工作集按操作顺序完成全部 Revision、Hash、归属、锚点和最终非空校验，全部通过后才在单写队列的一次事务中落库；成功 Revision 只加 1。
7. Editor Core 从已保存 Draft 与当前 Tiptap 文档生成 Patch：先删除、再调整保留块顺序、按稳定锚点逆序插入连续新块、最后更新内容。块类型变化按 delete + insert 处理，避免擅自修改冻结的 update 格式。
8. Main、Preload、Renderer 全链路切换到 Patch，冲突时保留窗口内容并停止显示已保存；删除快照写入能力。
9. 同步 IPC、数据库、编辑器文档、追踪矩阵和 M1-05 证据。
10. 依次运行 lint、format、typecheck、unit、integration、migration、security、E2E、全量 test、build、边界和发布门禁；当前环境无 DISPLAY，桌面 E2E 如仍受阻必须如实记录。

## 关键不变量

- `project.sqlite` 仍是唯一正文真源。
- Renderer 不生成权威 ID、Hash、Revision、orderKey、source 或 locked 值。
- 每个成功 Patch 批次只增加一次 Draft Revision；任何失败整批回滚。
- update/delete/move 必须携带并校验 `expectedHash`。
- 重复 requestId 不得再次执行写入。
- 普通编辑撤销继续使用 ProseMirror 历史；本任务只为后续持久化 inverse patch 留下完整日志基础，不提前实现锁定或 Candidate。
