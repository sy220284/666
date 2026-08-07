# M10-15 已知风险与回退边界

## 剩余风险

1. **未验证 Provider 的运行失败（Medium，设计内接受）**  
   `generationAvailable` 现在表达“可尝试生成”，未验证 Provider 仍可能因密钥、端点、模型能力或网络问题在真实请求时失败。风险继续由既有 AI Readiness / ModelSupportProfile 呈现，不能重新把“当前会话已验证”提升为 Core 硬阻断。

2. **归档实体历史上下文依赖显式 SceneBeat 引用（Low，已限定）**  
   Archived Entity 只有在目标章节 SceneBeat 明确引用时才恢复 Entity / Canon 上下文。未建立该引用的历史材料仍不会因目录归档而自动进入约束包，避免把全局已归档目录重新激活。

3. **故事时序依赖卷章顺序（Low，设计内）**  
   伏笔和人物弧光的 current / upcoming 投影以当前卷、章节顺序为依据。作者重排章节后约束时序与 `constraintHash` 会随之改变，这是预期行为；后续重构不得缓存旧顺序结果冒充当前权威。

4. **Final-only 任务依赖既有 Final Version 前置条件（Low，已锁定）**  
   `validate/state_extract` 不再读取 Current Draft。若调用链缺失可用 Final Version，应沿既有前置校验失败，禁止为“提高成功率”重新混入 Draft。

5. **外部模型服务边界（Medium，既有）**  
   本任务不改变用户自配 Provider 的外部服务信任边界、数据处理方式或可用性；DNS、HTTPS、响应上限等既有安全策略继续适用。

## 回退边界

- 不恢复 Flush 后继续使用旧 Draft Revision 的启动路径；
- 不把 unverified Provider 重新改成 `generationAvailable=false` 的统一硬阻断；
- 不允许 `validate/state_extract` 混入 Current Draft；
- 不从 Prompt 或 `constraintHash` 移除 `temporalStatus`；
- 不把 archived Entity 恢复为全局 active，也不把目录归档误标成故事时间 historical；
- 不扩大无关未来伏笔的基础 Constraint 召回；
- 不修改 Migration、Schema、生产依赖或锁文件来规避本任务问题；
- 不降低 Coverage、Security、Performance 或 Electron E2E 阈值。
