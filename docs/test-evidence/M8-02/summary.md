# M8-02 验证记录

生成时间：2026-07-28T08:35:00Z  
产品提交：`025b11101651b5362f131e24e35f3338314478c2`  
正式PR：[#224](https://github.com/sy220284/666/pull/224)

M8-02仍为`In Progress`。本轮依据P0矩阵、功能清单、UI验收、安全与性能文档，关闭了可由仓库代码完成的四项缺口，并增加可审计性能工件；真实Provider、多模型质量、物理显示、人工无障碍、签名公证和安装生命周期仍为发布级Blocked，因此当前结论继续为`禁止发布`。

## 本轮代码闭环

- StatusArbiter复用Candidate、StateProposal、Validation和FTS既有权威查询；查询失败显式标记不可读，不再静默当作零。
- 既有`candidate.list`合同扩展为可选章节筛选；仅传projectId时由Core跨章节读取全项目Candidate，章节工作台原调用保持兼容。
- 中断/待审Candidate、pending StateProposal、开放ValidationIssue、FTS rebuilding/stale/failed和AI未验证状态进入P1—P3仲裁，并提供对应工作台动作。
- “AI优先”仅在本次会话真实Provider连接测试成功后解锁；Provider保存、修改、删除或应用重启后验证状态失效，离线创作能力不受影响。
- 诊断导出在Main可信边界重新生成清单并执行原生确认；拒绝确认时不打开目录选择器、不写文件，确认后导出同一份白名单Preview。
- 新增M8发布性能证据测试，并使Performance成功时保存日志、AI协议结果和结构化JSON工件。

## 定向验证

| 范围 | 运行 | 结果 | 说明 |
|---|---:|---|---|
| Renderer状态仲裁与AI会话可用性 | 30339219630 | PASS | TypeScript通过；AI readiness、workspace attention、StatusArbiter共4项测试通过。 |
| Main诊断可信确认 | 30339582887 | PASS | TypeScript通过；诊断IPC可信确认与既有诊断导出共2项安全测试通过。 |
| 性能预算与AI协议 | 30340605091 | PASS | 11个性能文件、40项测试通过；AI协议2个文件、8项测试通过。 |
| Performance工件 | artifact 8680890788 | PASS | `performance-evidence`，sha256:`959c0377a08cf6a147a5cf0f9ee0ed6950a4e63ef8c645ce206309b3dab852ac`。 |
| 全项目Candidate汇总 | 30342560850 | PASS | Contracts→Core→Preload→Renderer纵向闭环；TypeScript及2个定向测试文件通过。 |

## 结构化性能记录

| 指标 | Fixture | P95/结果 | 预算 | 结论 |
|---|---|---:|---:|---|
| 本地输入统计 | 2K正文，60样本 | 0.55 ms | ≤50 ms | PASS |
| SQLite自动保存事务 | 2K正文，40样本 | 3.48 ms | ≤150 ms | PASS |
| Candidate Diff结构首屏 | 5000字，20样本 | 0.39 ms | <500 ms | PASS |
| Candidate Diff完整计算 | 5000字，20样本 | 3.39 ms | <1200 ms | PASS |
| FTS查询 | 1,563,300字符，30样本 | 8.33 ms | ≤200 ms | PASS |
| FTS重建 | 1,563,300字符 | 204.02 ms | <10,000 ms | PASS |

上述数字来自Linux x64 GitHub-hosted runner、Node v24.18.0，只作为自动化回归基线；不替代物理设备、真实多屏、长期运行、Renderer帧率或真实Provider延迟验收。原始数据见`performance.json`。

## 前置C8自动化基线

- Quality #2239：Static、Unit、Integration、Migration、Coverage、Build和Electron E2E 28/28通过。
- Security #2029：32个文件、94项安全测试通过。
- Windows、macOS、Linux便携工件完成ASAR/Fuse/Hash与启动冒烟；不代表签名、公证或安装生命周期通过。
- AI协议与确定性Fixture覆盖T0、T1、rewrite、merge、validate和state_extract；不代表真实模型质量通过。

## 尚未关闭

- 真实Provider账号、限流、成本、权限与多模型质量矩阵。
- 物理2K 125/150%、21:9、混合DPI、真实多屏、读屏、IME、自定义字体和五分钟新手人工路径。
- Windows代码签名、macOS签名/公证，以及三平台安装、升级、卸载；Linux生产sandbox和桌面集成。
- 真实超大DOCX、中央目录与本地Header字段级交叉验证、平台文件系统差异。
- 多进程或重复Core实例下日常备份持久化幂等。
- Recovery失败备份账本尚无正式权威查询，StatusArbiter不能可靠展示历史备份失败。
- 完整真实AI Electron单链路、长期运行、Renderer滚动帧率和Core事件循环阻塞报告。

## 当前判断

M8-02保持`In Progress`，PR #224保持Draft。自动化代码闭环已推进，但外部发布级P0仍存在，V1.0不得转`Verified`，不得生成正式发布。
