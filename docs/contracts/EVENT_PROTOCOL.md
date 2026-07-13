# WorldForge 事件与流式协议

> 状态：Approved  
> 用途：定义AI生成、长任务、状态更新和跨页面任务条的事件语义。

## 1. 协议目标

- AI流式输出不逐Token轰炸IPC。
- 切换章节或页面时任务继续运行且不串稿。
- 事件可排序、可取消、可恢复展示。
- Renderer只展示临时流，权威结果由Core落库。
- 长任务阶段必须对应真实程序阶段，不显示伪造进度。

## 2. 通用事件信封

```ts
interface EventEnvelope<T> {
  protocolVersion: 1;
  eventId: string;
  taskId: string;
  sequence: number;
  type: string;
  payload: T;
  emittedAt: string;
}
```

规则：

- 同一`taskId`内`sequence`从1递增。
- Renderer发现缺号时请求任务快照，不自行猜测文本。
- 任务结束后不再发送`delta`。
- 重复事件按`eventId`去重。

## 3. AI流式事件

```ts
type AIStreamEvent =
  | { type: 'ai.started'; payload: { runId: string; stage: string } }
  | { type: 'ai.stage'; payload: { stage: AIStage; message: string } }
  | { type: 'ai.delta'; payload: { text: string; receivedChars: number } }
  | { type: 'ai.usage'; payload: { inputTokens?: number; outputTokens?: number } }
  | { type: 'ai.candidateSaved'; payload: { candidateId: string; completeness: 'complete' | 'partial' } }
  | { type: 'ai.completed'; payload: { candidateIds: string[] } }
  | { type: 'ai.cancelled'; payload: { partialAvailable: boolean } }
  | { type: 'ai.failed'; payload: { errorCode: string; retryable: boolean } };
```

推荐阶段：

```text
queued
assembling_constraints
calling_model
receiving_output
parsing_output
saving_candidate
validating_candidate
completed
```

UI可以使用更自然的文案，但不得显示并未真实执行的阶段。

## 4. 增量批量与背压

- Core收集Provider增量，每20—50ms或达到字符阈值后发送一批。
- 不以单Token为IPC消息单位。
- Renderer渲染落后时，Core合并尚未发送的文本批次。
- 已经发出的事件不修改；缺号通过任务快照补齐。
- 大段流式文本使用内存缓冲，不在每个delta时写SQLite。

## 5. 取消

```text
Renderer发送 ai.cancelGeneration(runId)
→ Core设置取消信号
→ Provider适配器中止请求
→ 停止未来delta
→ 进入保存部分结果或清理阶段
→ 发送ai.cancelled
```

目标：收到取消命令后500ms内给出已接收反馈。Provider无法立即中止时，UI显示“正在停止”，但不得继续把增量写入其他任务。

## 6. 页面切换和应用关闭

- 切换章节、工作台或视图不取消任务。
- 全局任务条根据`taskId`展示当前阶段。
- 回到原章节时从Core任务快照恢复流式预览。
- 关闭项目时若有运行任务，用户选择继续等待、取消或放弃未保存部分结果。
- 应用强制退出后，只有已持久化Candidate可恢复；内存临时流不宣称已保存。

## 7. 其他长任务事件

通用类型：

```text
task.started
task.stage
task.progress
task.warning
task.completed
task.cancelled
task.failed
```

适用：

- 导入预览与提交。
- 导出。
- 备份、验证与恢复。
- FTS重建。
- 数据库优化。
- Candidate Diff。
- 超长篇记忆重算。

`task.progress`只有在可计算总量时提供`current/total`；不可计算时只显示阶段和已运行时间。

## 8. 状态更新事件

业务写命令成功后可发送轻量事件：

- `draft.revisionChanged`
- `chapter.statusChanged`
- `candidate.statusChanged`
- `backup.created`
- `validation.updated`
- `settings.changed`

这些事件用于刷新多个Renderer组件，不承担权威数据传输；组件收到后应按需重新查询。

## 9. 任务快照

```ts
interface TaskSnapshot {
  taskId: string;
  taskType: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  stage: string;
  lastSequence: number;
  startedAt: string;
  elapsedMs: number;
  receivedChars?: number;
  resultIds?: string[];
  errorCode?: string;
}
```

Renderer重连、页面恢复或发现序号缺失时调用`task.getSnapshot`。

## 10. 测试

- 乱序、重复、缺号和延迟事件。
- 逐Token Provider输入经批量后消息数显著降低。
- Renderer阻塞时Core不无限积压消息。
- 切章和多任务并行不串`taskId`。
- 取消后无新的正文增量进入已取消任务。
- Provider中断后partial Candidate状态正确。
