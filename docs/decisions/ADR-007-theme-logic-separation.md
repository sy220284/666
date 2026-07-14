# ADR-007：主题只影响视觉层，不得分叉业务逻辑

- 状态：Frozen
- 日期：2026-07-14
- 对应任务：`M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md`

## 背景

REQ-047要求提供两种视觉方向：Theme A“安静编辑部”和Theme B“水墨印章”。两种视觉方向可以拥有不同的Design Token、字体、图标和确认动画，但底层Candidate、Version、Patch和状态机必须完全一致。

## 决策

1. 主题和对比模式只能改变Design Token、图标、字体、间距、圆角、阴影、纹理和动画表现。
2. 主题不得改变IPC契约、事件协议、状态机、数据库、Use Case或业务权限。
3. `candidate.apply`、`version.create`等命令在所有主题下完全相同。
4. Theme B的印章效果只在命令成功返回后播放；动画失败、跳过或减少动态不影响业务结果。
5. 组件层禁止使用主题条件分支决定业务命令、数据写入、冲突处理或状态推进。
6. 新增视觉方向不需要修改Core、Repository或IPC。
7. Theme A在V1.0提供浅色、深色、护眼和高对比；Theme B按冻结专项文档提供浅色、深色和印章表现层。
8. Theme B后续对比模式如扩展，必须在独立任务中验证Token与无障碍，不得顺手引入业务分支。

## 结果

### 正面

- 新增视觉方向只影响UI表现层。
- Candidate采用、定稿和状态确认的安全测试不随主题数量重复分叉。
- 主题切换不会改变项目数据和业务结果。

### 代价

- 视觉资源与Token命名必须严格统一。
- Theme B印章动效需要独立无障碍和减少动态降级。

## 强制约束

- 代码审查发现主题字符串与业务命令同时参与条件分支时拒绝合并。
- 同一Candidate在切换主题前后采用，生成的Patch、Revision和ApplyRecord必须一致。
- 主题测试不能只验证截图，还需验证业务结果不变。

## 验证

- 静态扫描主题判断与业务命令耦合。
- Theme A/Theme B分别执行Candidate采用、章节定稿和冲突处理。
- `prefers-reduced-motion`下功能完整可用。
