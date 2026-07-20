# M2-02人工验收记录

验收依据：PR #89最终Head、Quality运行`29715921711`、Security运行`29715921602`和Main Verification运行`29716128906`。

1. Candidate只读预览不会修改当前Draft，丢弃后Draft内容和Revision保持不变。
2. 候选待处理、已接受、已丢弃以及complete/partial状态均由持久化测试覆盖。
3. Candidate块及聚合内容Hash发生漂移时读取被拒绝。
4. Version保留parentVersionId、sourceCandidateId、sourceRevision和内容Hash；Draft后续修改不改变历史Version。
5. 外部项目的Version或Candidate来源关系被明确拒绝。
6. 三张任务专属截图保留原始二进制，截图清单与SHA-256一致。
7. Unit、Integration、Migration、Security与Electron E2E均在干净工作树上完成。

结论：P0-020、P0-021对应的Candidate隔离和完整Version模型通过复验。
