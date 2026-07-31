# M8-08风险记录

- M8-08尚未合并，最终main验证与正式Release仍保持阻断。
- 工件未签名、未公证，严格限定仓库所有者本人自用。
- Linux CI使用仓库既有的显式`--no-sandbox`回退，仅用于Ubuntu 24.04 AppArmor Runner；不改变产品默认沙箱策略。
- 来源PR验证不得替代最终main验证。
