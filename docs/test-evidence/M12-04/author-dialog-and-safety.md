# 统一作者弹窗与操作安全

- `AuthorDialogHost` 为普通确认、文本输入、选项选择和高风险精确名称确认提供唯一应用内宿主。
- 危险名称不匹配或选项尚未选择时确认按钮保持禁用；取消与 Esc 返回否定结果。
- 打开弹窗后焦点进入受控操作，关闭后恢复作者之前的焦点位置。
- Canon、结构、场景、研究、设置、候选审阅与未保存导航均复用统一宿主，不降低只读、危险操作、LockGuard 或 Candidate Apply 保护。
- `tests/unit/m12-04-author-experience-convergence.test.ts` 对真实宿主完成确认、文本、选项、精确名称、Esc 和焦点恢复测试，并扫描所有 Feature／Runtime 原生弹窗调用。
- `tests/e2e/author-dialog.ts` 驱动真实 Electron 中的应用内作者弹窗；删除、拆章、候选放弃与结构恢复场景不再模拟浏览器原生对话框。
- 唯一原生 `window.confirm` 位于关闭握手同步安全兜底，代码说明例外原因，并由关闭与未保存保护测试覆盖。
