# AR-04 Writing章节会话状态机专项验证与回退

## 检查点

- 统一任务：M9-03
- 实施PR：#272
- 前置成功检查点：`d2e5893`（AR-03完成）
- AR-04代码检查点：`f7e17c1`
- 风险级别：高

## 结构结果

- `writing-core-workbench.tsx`从1092行收敛为235行，只负责状态装配与视图组合。
- 显式状态机覆盖`idle → loading → ready → flushing → switching → failed`。
- `useChapterSession`、`useEditorLifecycle`、`useDraftAutosave`分别承接章节请求、Editor代次与自动保存职责。
- `DraftSaveContext`使用只读字段、请求时Editor实例、Editor代次、Draft修订和请求快照；旧响应必须通过统一当前性校验后才能同步。
- 面板切换、返回项目、结构写入和章节切换继续复用同一Draft Flush入口。
- 所有新增组合根、Panel、Hook和Controller满足M9-03正式结构预算；结构扫描没有新增债务或循环依赖。

## 不变量核对

- 新Draft读取成功前不替换`activeChapter`或`activeDraft`，旧Editor在读取期间停止编辑。
- A→B→C快速切换由章节ID和请求代次双重判定，只允许当前请求挂载。
- Draft保存响应同时校验章节、Draft、Editor实例和Editor代次，不能覆盖新会话。
- IME开始时暂停Autosave，结束时恢复并重新标脏；组合期间结构键和保存仍被阻止。
- 保存完成后比较请求指纹与当前Editor内容，存在新输入时继续显示待保存语义。
- Candidate、Version、Bridge、IPC Channel、Schema和持久化格式未改变。

## 已执行验证

- `pnpm check:boundaries`：272个源码文件、753条相对依赖边、15个既有结构债务。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm test:unit`：101个测试文件、655项测试通过；其中会话架构专项另以5个文件、15项定向测试复核。
- `pnpm test:integration`：58个测试文件、162项测试通过。
- `pnpm test:security`：34个测试文件、97项通过、1项跳过。
- `git diff --check`：通过。

Draft PR的Linux/Windows/macOS工作流必须继续验证Electron E2E、真实Microsoft拼音场景、Build和Package Smoke；这些远端结果成功前不得进入AR-05。

## 回退边界

AR-04不包含Schema、Migration、协议或公开Bridge变更。若专项CI、真实IME或章节时序出现回归，在统一分支上回退代码检查点`f7e17c1`即可恢复到AR-03成功基线`d2e5893`；不得在AR-05中追补会话失败。回退后重新运行AR-03的Unit、Integration、Security和Writing定向矩阵，确认Candidate、Version和Generation仍保持成功。
