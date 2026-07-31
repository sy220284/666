# 能力矩阵验证

ApplicationCapabilities区分Shell、Core、设置、Provider、生成与诊断能力。ProjectCapabilities区分项目/数据库/结构/正文/设定的读写能力，以及导出、备份、恢复和移动能力。

验证模式：normal、read-only-compatible、read-only-integrity-failed、recovery-only；并覆盖Core不可用、Provider未配置/不可用和数据库可读不可写。
