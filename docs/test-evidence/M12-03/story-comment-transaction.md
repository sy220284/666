# M12-03 StoryComment 批处理事务验收

权威集成用例：`tests/integration/state-validation-provider.test.ts` 中
`runs deterministic and AI checks with stable anchors, semantic freshness, issue actions, todos and comments`。

该用例由最终 Product 运行 `32152968200` 执行并通过，所在完整产品测试结果为 511/511 文件、2264/2264 用例成功。

事务路径验证：

1. 从真实 ValidationIssue 创建 StoryComment。
2. `batchComments` 批量添加 `伏笔`、`作者复核` 标签，状态与标签正确持久化。
3. `batchComments` 批量标记已处理。
4. 单条重新打开后，状态恢复为 `open`。
5. 随后向一次批处理同时传入“真实 commentId + 随机不存在 commentId”，调用必须整体拒绝。
6. 拒绝后重新读取 Validation Catalog，原真实批注仍保持 `open`。

这证明批处理在执行写入前完整校验目标集合；失败路径不会把前半部分操作静默提交，不存在“部分成功、部分失败”的批注状态。
