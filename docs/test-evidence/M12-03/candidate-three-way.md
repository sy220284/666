# M12-03 Candidate 三栏冲突与降级验收

最终实现提交：`eecf8113b5ccf7d604b9a2988b7ddd7236e57c39`

最终 Quality：`32152968200`，Electron E2E 第 1 片成功。
- Artifact：`9330942687`
- Digest：`sha256:985c1207cfcd720639ef7e6885002d265b4a1607da4ed0d800f71408febebd5b`
- 分片结果：21/21 通过。

专项用例：`tests/e2e/candidate-protection.spec.ts` → `preserves the newer Draft when Candidate base state is stale`。

验收先向真实 Draft 写入非空基础正文，再创建真实 Version 和 Candidate，因此三栏不是空基线伪造：

1. 1400×900：基础版本｜当前稿｜建议稿三栏可见。
2. 1000×900：降级为两栏，基础版本隐藏。
3. 720×900：降级为单栏，只保留比较/建议稿。
4. 恢复宽视口后人工修改当前 Draft，使 Candidate 的基础 Revision 失效。
5. 点击采用后，界面明确提示当前稿未改变并产生冲突。
6. 关闭 Electron 后直接读取 `project.sqlite`：
   - `candidate_apply_records = 0`
   - `candidate_apply_checkpoints = 0`
   - `candidate_conflict_sets = 1`
   - Candidate 状态仍为 `pending`

同一 Artifact 还包含 2560×1440 的 100/125/150/200% DPI，以及 2560×1600、3440×1440、3840×2160 显示矩阵截图。
