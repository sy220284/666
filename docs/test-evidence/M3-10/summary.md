# M3-10 批量复验记录

生成时间：2026-07-22T11:30:00.000Z  
批量基线：f6d326887c43f3c561bf913d6090e00ffe9e4551

## 交付结论

正文、Version与Candidate完成React迁移；Tiptap、800ms自动保存、中文IME、查找替换、块类型、锁定、统计、切换flush、Version不可变、恢复为新Draft、Candidate预览零写入、原子采用及跨重启撤销均保留。旧命令式Renderer业务入口已物理退役。

## 复验结论

复核覆盖章节重开选区、Version创建/定稿/比较/导出/恢复、Candidate取消/丢弃/采用/冲突/撤销、锁定和Revision/Hash保护。React成为Renderer唯一正式页面渲染系统。

## 自动化与桌面证据

- Quality：运行 `29914507812`，静态、构建、单元、集成、迁移与Electron E2E全部成功。
- Electron E2E：25/25，工件 `8527587874`，Digest `sha256:0b2163c9411940ad9a1c0b054df444d50a24dce6949e96b9ecd1a53b686efa47`。
- Security：运行 `29914507551`。
- Performance：运行 `29914507599`。
- PR Policy、Task Governance、Evidence与Repository Governance分别由 `29914507537`、`29914507651`、`29914507544`、`29914507567` 验证。

## 状态结论

任务卡范围、真实实现、自动化结果与人工复核一致，可以关闭为Verified。跨后续阶段的需求继续保留其原有状态。

## M0—M3整体审计整改复验

复验时间：2026-07-23T02:39:03.000Z  
整改Head：`537d0dda432738accbd94c18f7f0c129f2a54e89`  
合并提交：`9a813efa75ec6a49b7547392d70118f977d8e263`  
整改PR：`#150 fix(M0-M3): harden integrated coordination`

### 整改覆盖

- Core异常后的未保存正文救援、受控重启和项目恢复；
- Schema 18下的Version、结构操作、SceneBeat链接与EndingSnapshot协调；
- 伏笔和人物弧光按目标章节投影，阻止后文状态倒灌；
- Renderer取消结果真实性、Core超时结果未知语义和Candidate测试Fixture生产隔离；
- 写作工作台原生选区跨返回与重开恢复，并在编辑器完成挂载和选区恢复后发布工作区就绪标记。

### 最终自动化证据

- Quality：运行 `29974447440`，静态、格式、lint、typecheck、Build、Unit、Integration、Migration和完整Electron E2E全部成功。
- Electron E2E：25/25，用时10.8分钟；工件 `8551052690`，Digest `sha256:b3ad768b6a0fc26d026297d4c46fb7e877b630b58d14345f9794df9b550e24db`。
- Security：运行 `29974447347`，成功。
- Performance：运行 `29974447341`，成功。
- PR Policy：运行 `29974447383`，成功。
- Task Governance：运行 `29974447345`，成功。
- Evidence：运行 `29974447346`，成功。

### 整改状态结论

机器Manifest限定的M0—M3既有Verified能力整改已通过完整复验并合并至`main`；`ACTIVE_TASK`与M4-01状态未在整改中改变。该结论只覆盖PR #150列明的审计整改范围，不提前登记M4阶段功能完成。
