# M12-02 附件失败路径证据

自动化覆盖并保持 fail-closed：

- live managed attachment 缺失；
- live attachment 大小或 SHA-256 与数据库快照不符；
- backup artifact 缺失；
- backup artifact Hash/大小损坏；
- artifact manifest 缺失、不可读、identity 不匹配或重复；
- manifest 相对路径包含绝对路径、`.`、`..`、空段或 NUL；
- restore 目标路径逃逸项目工作区；
- 导入文件路径穿越、危险文件名、超限与不允许的预览类型；
- 恢复附件不完整时禁止把目标项目报告为完整恢复成功。

相关可靠性与集成测试在最终 Product/Reliability 门禁中通过。
