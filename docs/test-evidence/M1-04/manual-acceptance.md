# M1-04 界面与人工复核记录

复核对象：Draft、Tiptap与中文输入  
复核方式：固定E2E场景、可见界面截图、数据库/契约断言及失败路径日志交叉核对。  
运行记录：https://github.com/sy220284/666/actions/runs/29551145839

## 逐项结论

| 验收项 | 复核内容 | 结论 |
|---|---|---|
| P0-013 | 拼音/五笔composition期间禁止破坏性提交，不丢字或重复。 | PASS |
| P0-015 | 网页脚本、样式、SVG和隐藏内容被清理，纯文本保留。 | PASS |
| DRAFT-REBUILD | 关闭重开后由DraftBlock完整重建编辑器正文。 | PASS |
| BLOCK-MODEL | paragraph/dialogue/heading/separator与logicalBlockId规则通过。 | PASS |

## 截图证据

- `screenshots/m1-04-chinese-block-editor.png`

## 独立复查

- 未以修改状态字段替代真实测试。
- 截图通过PNG头、非空体积和Playwright可见性断言。
- 自动化、数据结果与任务卡完成条件一致。
- 结论：通过。
