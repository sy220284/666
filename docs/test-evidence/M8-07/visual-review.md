# 四主题与1280×800人工复核

受检提交：`cd097424586af9ae42735953aee092feeb068859`

证据源：Quality run `30615390359`，Desktop E2E artifact `8787489122`。

## 四主题

| 截图 | 复核结论 |
|---|---|
| `theme-a-light-1280x800.png` | PASS：浅色文字与控件清晰，写作区结构完整 |
| `theme-a-dark-1280x800.png` | PASS：深色对比度清晰，按钮与正文边界可辨 |
| `theme-b-light-1280x800.png` | PASS：暖色浅色主题无遮挡和溢出 |
| `theme-b-dark-1280x800.png` | PASS：暖色深色主题正文与导航均可读 |

## 1280×800布局

- 页面没有整页横向滚动。
- 主内容区位于视口边界内。
- 章节标题宽度正常并保持单行。
- 编辑、拆分、合并、移动、删除等操作位于标题下方，可换行但未隐藏。
- 正文编辑区、卷章目录与顶部操作均保持可达。

证据：

- `artifact:8787489122/electron/acceptance/M8-07/theme-a-light-1280x800.png`
- `artifact:8787489122/electron/acceptance/M8-07/theme-a-dark-1280x800.png`
- `artifact:8787489122/electron/acceptance/M8-07/theme-b-light-1280x800.png`
- `artifact:8787489122/electron/acceptance/M8-07/theme-b-dark-1280x800.png`
- `artifact:8787489122/display-matrix/1280x800-100.png`
