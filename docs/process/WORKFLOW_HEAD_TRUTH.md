# 工作流Head真源与工作树清洁契约

## 1. 唯一验证对象

所有Pull Request永久门禁必须显式检出`github.event.pull_request.head.sha`。默认PR merge ref、Runner临时生成树和未提交工作树都不能作为合并证据。

## 2. 工作树清洁

每个会执行正式验证的Job在验证前后运行：

```bash
node .github/governance/assert-clean-tree.mjs
```

该检查包含已跟踪改动和未忽略的未跟踪文件。验证命令若修改正式源码、Migration、契约、测试、任务卡或产品文档，Job必须失败，修改结果必须由开发执行端提交后重新验证。

## 3. Evidence与PR Head绑定

Evidence工作流同时校验：

1. checkout的真实`HEAD`精确等于事件中的PR Head SHA；
2. Evidence Manifest中的`commit`是实际存在的提交；
3. 该提交是当前PR Head的祖先；
4. Evidence Check Run本身发布在当前PR Head上。

Manifest不写入包含自身的最终提交SHA，避免密码学自引用；它记录被验证的业务实现提交，工作流运行上下文负责把完整证据门禁绑定到最终PR Head。

## 4. Main Verification

当前main必须存在成功的`main-verification`状态。历史Bootstrap SHA不再允许；缺失、pending、failure或error均阻断下一次Controlled Merge。

## 5. Repository Governance

原生Ruleset严格审计在每周、手动以及治理工作流相关PR上执行。PR触发时固定检出`main`中的已审计脚本，避免PR自行修改审计程序后验证自身。
