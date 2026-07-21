# Renderer React迁移架构

## M3-07基础边界

Renderer以React Root作为新架构入口，现有命令式业务面通过单实例兼容层加载。M3-07只建立架构基础，不改变Core Use Case、IPC语义、数据库模型或业务结果。

新React代码遵循以下硬边界：

- 只能通过`src/bridge/`具名适配层访问Preload能力，业务组件不得直接访问`window.worldforge`。
- Zustand仅保存路由、选择ID、侧栏、Dialog、任务显示和返回位置等临时UI状态；Project、Draft、Candidate、Version、Canon及EntityState继续以Core为权威。
- 状态由StatusArbiter按P0安全与恢复、P1阻断、P2上下文、P3短时反馈仲裁；同级持久状态优先于短时反馈。
- 兼容层退役顺序固定为Autosave flush、异步取消、Tiptap销毁、事件注销，防止切换时丢稿或重复监听。
- 旧业务域由M3-08至M3-10逐域迁移；M3-10完成旧入口删除与架构门关闭。

## 构建与验证

Renderer构建前执行静态边界扫描，阻断Bridge绕过、React组件命令式控制业务DOM及Store持久化业务权威对象。Electron E2E必须同时验证React Root存在和旧业务路径仍可操作。
