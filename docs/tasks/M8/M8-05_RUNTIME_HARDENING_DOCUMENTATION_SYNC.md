# M8-05 运行时硬化与文档统一同步

> 状态：Verified  
> 里程碑：M8 长期维护  
> 优先级：P0  
> 正式分支：`work/m8-05-runtime-hardening-documentation-sync`  
> 实现提交：`1c5505b1a267e7ea43a70995b4dce7a5fc6abad3`  
> 最终PR Head：`b72f60d23f1523d8f75352d687460bd7d7e9af4d`  
> main实现提交：`02a595a247cdad83b74634dc5059b72dd93c9451`

## 目标

在M8-04已验证基线上，修复全文搜索、安全替换与作品词典之间的异步请求竞态，收敛Provider超限响应的错误语义，并将任务、产品、契约、安全、界面与验收文档统一到当前真实实现。

## 缺陷基线

1. 全文搜索、替换预览、正式替换与作品词典共用同一个请求代次；词典保存或删除可使在途搜索或替换响应失效，但旧请求在清理等待状态前退出，导致搜索与替换区域持续锁定。
2. Provider原始HTTP响应和单个SSE事件已经实施资源上限，但超限仍复用`AI_OUTPUT_INVALID_008`，与“结构化输出解析失败”的已发布语义冲突。
3. 多份任务、路线、产品、IPC、Provider、安全、界面和验收文档仍停留在M4-04或M8-02执行阶段，与36张任务全部Verified及M8-04终态不一致。

## 实施范围

### 1. 搜索工具异步隔离

- 为全文搜索、替换、作品词典和全文索引建立独立请求通道。
- 分离搜索、替换、词典和索引等待状态。
- 只允许当前通道的最新响应更新对应界面状态。
- 作品切换和页面卸载统一使全部通道失效。
- 词典写入期间禁用重复词典写操作，但不再错误锁死搜索与替换。

### 2. Provider错误语义

- 新增`AI_RESPONSE_TOO_LARGE_014`。
- Provider总响应或单个SSE事件超过安全上限时使用独立错误码。
- 同步作者提示、测试、Provider协议、安全用例、威胁模型和错误码文档。

### 3. 文档统一

- 当前任务与路线统一为37张独立任务，M8-05作为最终维护任务完成验证。
- 历史收口文档保留历史过程并明确后续演进，不再冒充当前执行真源。
- 补齐具名关闭握手、请求通道隔离、Provider资源上限、写作辅助、精准返回和长章节差异审阅的专项规格。
- 在M8-05任务、追踪矩阵和新Evidence中记录M8-04后续维护关系；M8-04历史任务卡与四件套Evidence保持哈希冻结。

## 非目标

- 不新增产品功能、云服务、模型代理、多人协作或公开分发能力。
- 不修改数据库Schema和历史Migration。
- 不改变搜索、替换、词典、Provider和建议稿的权威数据边界。
- 不重写历史已Verified任务卡和历史Evidence。
- 不降低Provider响应资源限制。

## 依赖

M8-04（Verified）

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/contracts/`
- `packages/core-service/`
- `tests/unit/`
- `tests/security/`
- `tests/e2e/`
- `docs/`
- `README.md`
- `CHANGELOG.md`

## 禁止路径

- `migrations/`
- `docs/test-evidence/M0/`
- `docs/test-evidence/M1/`
- `docs/test-evidence/M2/`
- `docs/test-evidence/M3/`
- `docs/test-evidence/M4-04/`
- `docs/test-evidence/M8-02/`
- `docs/test-evidence/M8-04/manifest.json`

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/ACTIVE_TASK.json`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/security/THREAT_MODEL.md`
- `docs/testing/SECURITY_TEST_CASES.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`

## 验收条件

1. 词典保存或删除发生在搜索/替换请求期间时，搜索/替换等待状态能够正常结束。
2. 同一请求通道的旧响应不能覆盖新响应；不同通道互不错误失效。
3. 作品切换后全部旧响应失效，且不会更新新作品界面。
4. Provider声明长度、实际流式总量和无分隔SSE事件超限均返回`AI_RESPONSE_TOO_LARGE_014`。
5. 作者界面提供明确、非技术化的超限处理建议。
6. 任务、产品、契约、安全、界面、测试和发布文档与真实代码一致。
7. 受影响单元、安全、性能、Electron端到端、全量测试和构建全部通过。

## 实现结果

- 搜索、替换、词典和索引已经使用四个独立请求通道及等待状态。
- 同通道旧响应、跨作品旧响应和全部通道统一失效均有单元测试。
- 搜索面板接线测试锁定词典等待状态不参与搜索工具互斥。
- Provider三条响应超限路径均返回`AI_RESPONSE_TOO_LARGE_014`。
- 作者错误提示明确说明安全停止、正文未修改和可执行处理动作。
- 任务、路线、产品、IPC、Provider、安全、UI、验收、README和CHANGELOG完成统一同步。
- M4-04与M8-04历史任务和Evidence保持冻结。

## 最终验证结果

最终PR Head `b72f60d23f1523d8f75352d687460bd7d7e9af4d`的六项永久门禁全部成功：

```text
PR Policy       30511563140  success
Task Governance 30511563097  success
Evidence        30511563096  success
Quality         30511563241  success
Security        30511563137  success
Performance     30511563092  success
```

PR #229使用`expected_head_sha`受控压缩合并，生成main提交`02a595a247cdad83b74634dc5059b72dd93c9451`。Main Verification运行`30512257330`成功，确认最终main SHA、来源PR、来源Head和永久门禁一致。

详细记录：`docs/test-evidence/M8-05/`。

## 关闭结论

代码、测试、文档、受控合并、主分支验证与最终Evidence均已完成。M8-05关闭为Verified，并作为37张独立任务的最终验证锚点进入`VERIFIED_HOLD`。后续新增功能、公开分发能力或新缺陷修复必须重新立项。
