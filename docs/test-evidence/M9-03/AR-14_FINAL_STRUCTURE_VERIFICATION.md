# AR-14 Legacy退役、CSS分层与结构预算最终验证

## 1. 检查点

- 任务：M9-03 / AR-14
- 正式PR：#273
- 隔离验证PR：#288
- 隔离最终Head：`ac2f65c4871be5fa75a5e21e175b632a8359f352`
- 正式原子提交：`68cf81469eabb2d9bebeed356e01faa71076faf9`
- Quality Run：`30749705215`
- Security Run：`30749705120`
- Performance Run：`30749705111`
- Evidence Run：`30749705131`
- 结果：AR-14实现与隔离完整矩阵通过；正式PR等待Implemented证据提交后的永久门禁。

## 2. 最终结构结果

- 将Draft Flush、展示状态和布局策略迁入正式`RendererApplicationController`。
- 删除无职责`legacy-surface.ts`空壳，正式调用链不再依赖Legacy入口。
- 删除旧`styles.css`、`m3.css`、`m8-07.css`。
- Renderer CSS按Base、Layout、Components、Themes责任域及显式Cascade Layer重组。
- 修复样式构建目录并发竞态，构建按明确文件清单复制全部CSS资产。
- 清空历史超大文件白名单与允许循环依赖清单。
- 最终结构扫描：397个源码文件、1171条相对导入边、0项登记结构债务。

## 3. 真实问题与整改

首次完整E2E发现CSS迁移遗漏React首页和设置页的左右工作区对齐规则。设置值及`data-workspace-alignment`均正常，视觉规则缺失导致左右边距不变。

整改：恢复左右对齐正式CSS规则，新增`ar14-workspace-alignment-contract.test.ts`防回归；未修改或弱化E2E断言。修复后Electron E2E 33项全部通过。

## 4. 自动验证

最终受检Head `ac2f65c4871be5fa75a5e21e175b632a8359f352`：

```text
Workspace / Boundaries / Format / Lint / Typecheck  PASS
Unit / Integration / Migration / Coverage          PASS
Build / Electron E2E 33/33                         PASS
Security / Performance / Evidence                  PASS
Quality aggregate / Package Smoke normalization    PASS
```

Coverage检查点：239个测试文件、1042项测试通过；Statements 84.63%、Branches 75.03%、Functions 84.98%、Lines 86.69%。新增对齐契约在最终正式Head继续通过。

临时验证PR上的Task Governance与PR Policy失败源于并存验证PR策略，不作为正式门禁结果；正式PR #273在证据与Runtime同步后重新执行全部永久门禁。

## 5. 回退

AR-14未修改Schema、Migration、IPC协议、错误码或持久化格式。回退时应整体恢复旧Legacy/CSS入口与结构基线，禁止只恢复旧CSS文件而保留新HTML和构建清单；回退后必须重新执行Static、Build、Coverage、Security、Performance与Electron E2E。

## 6. 结论

AR-03—AR-14实现已全部完成。M9-03可推进到Implemented，待正式PR永久门禁、Ready矩阵、合并及main验证后独立关闭为Verified。
