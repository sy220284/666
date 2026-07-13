# M3-04 候选Diff、冲突、采用与回退

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m3-candidate-review`

## 目标

让作者在长章节中高效比较、选择和采用Candidate，并在冲突与后续修改存在时保持安全可回退。

## 依赖

M1-04、M3-03、M0-06。

## 关联

- 需求：REQ-013、REQ-029
- 验收：P0-029—P0-032

## 必读文档

- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 实施内容

1. logicalBlockId结构Diff优先。
2. 识别拆分、合并、新增、删除和移动。
3. 块内中文字符Diff。
4. 双栏、上下、单稿、只看差异和场景导航数据接口。
5. 同步滚动与解除同步。
6. 选择映射生成Block Patch。
7. 生成Revision、Hash、锁定和结构冲突集。
8. 原子采用、ApplyRecord、即时撤销和重启后回退。

## 性能

- 5000字首屏≤500ms。
- 完整Diff≤1.2s。
- 计算可取消且不阻塞编辑器。

## 测试

同段同时修改、块删除、候选拆分、锁定块、partial Candidate、整稿/局部采用、冲突后二次提交、即时撤销和重启后恢复。

## 完成条件

无静默覆盖；所有冲突必须由作者决策；采用后可追溯Candidate来源并可靠回退。
