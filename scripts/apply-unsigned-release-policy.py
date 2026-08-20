from pathlib import Path


def load(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def save(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def remove_between(text: str, start: str, end: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"{label}: start marker not found")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{label}: end marker not found")
    return text[:start_index] + text[end_index:]


# Release workflow: all release kinds publish unsigned packages.
path = ".github/workflows/release.yml"
text = load(path)
text = replace_once(
    text,
    "      require_distribution_trust:\n        description: Require Windows signing plus macOS signing/notarization for non-stable builds\n        required: true\n        default: false\n        type: boolean\n",
    "",
    "remove obsolete distribution trust input",
)
text = replace_once(
    text,
    "  DISTRIBUTION_TRUST_MODE: ${{ (inputs.release_kind == 'stable' || github.event_name == 'issue_comment' || inputs.require_distribution_trust) && 'required' || 'allow-unsigned' }}\n",
    "  DISTRIBUTION_TRUST_MODE: allow-unsigned\n",
    "force unsigned release mode",
)
text = remove_between(
    text,
    "      - name: Validate required distribution credentials\n",
    "      - name: Enforce source and product release acceptance gates\n",
    "remove distribution credential gate",
)
text = remove_between(
    text,
    "      - name: Prepare Windows signing certificate\n",
    "      - name: Prepare macOS signing and notarization credentials\n",
    "remove Windows signing preparation",
)
text = remove_between(
    text,
    "      - name: Prepare macOS signing and notarization credentials\n",
    "      - name: Build Linux platform package\n",
    "remove macOS signing preparation",
)
text = replace_once(
    text,
    "      - name: Build unsigned Windows platform package\n        if: matrix.platform == 'windows' && env.DISTRIBUTION_TRUST_MODE == 'allow-unsigned'\n",
    "      - name: Build Windows platform package\n        if: matrix.platform == 'windows'\n",
    "normalize Windows package step",
)
text = remove_between(
    text,
    "      - name: Build trusted Windows platform package\n",
    "      - name: Build unsigned macOS platform package\n",
    "remove trusted Windows package step",
)
text = replace_once(
    text,
    "      - name: Build unsigned macOS platform package\n        if: matrix.platform == 'macos' && env.DISTRIBUTION_TRUST_MODE == 'allow-unsigned'\n",
    "      - name: Build macOS platform package\n        if: matrix.platform == 'macos'\n",
    "normalize macOS package step",
)
text = remove_between(
    text,
    "      - name: Build trusted macOS platform package\n",
    "      - name: Verify platform package assets\n",
    "remove trusted macOS package step",
)
text = remove_between(
    text,
    "      - name: Remove temporary distribution credentials\n",
    "      - name: Run Linux packaged startup smoke\n",
    "remove distribution credential cleanup",
)
for token in [
    "WINDOWS_CERTIFICATE_BASE64",
    "WINDOWS_CERTIFICATE_PASSWORD",
    "MACOS_CERTIFICATE_BASE64",
    "MACOS_CERTIFICATE_PASSWORD",
    "MACOS_SIGN_IDENTITY",
    "APPLE_API_KEY_BASE64",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
    "require_distribution_trust",
    "Build trusted Windows platform package",
    "Build trusted macOS platform package",
]:
    if token in text:
        raise SystemExit(f"release workflow still contains signing token: {token}")
if "DISTRIBUTION_TRUST_MODE: allow-unsigned" not in text:
    raise SystemExit("release workflow does not force allow-unsigned")
save(path, text)

# Release acceptance: stable may be unsigned. Explicit required mode remains available only to lower-level tooling.
path = "scripts/release-acceptance.mjs"
text = load(path)
text = replace_once(
    text,
    "  const trustMode = distributionTrust ?? (releaseKind === 'stable' ? 'required' : 'allow-unsigned');\n",
    "  const trustMode = distributionTrust ?? 'allow-unsigned';\n",
    "release acceptance unsigned default",
)
text = replace_once(
    text,
    "  if (releaseKind === 'stable' && trustMode !== 'required') {\n    throw new Error('Stable releases must require platform distribution trust');\n  }\n",
    "",
    "remove stable signing hard gate",
)
text = replace_once(
    text,
    "    'verify-package-assets.mjs',\n    'MACOS_CERTIFICATE_BASE64',\n    'WINDOWS_CERTIFICATE_BASE64',\n    'gh release create',\n",
    "    'verify-package-assets.mjs',\n    'DISTRIBUTION_TRUST_MODE: allow-unsigned',\n    'gh release create',\n",
    "release workflow required markers",
)
insertion = "  for (const token of [\n    'WINDOWS_CERTIFICATE_BASE64',\n    'WINDOWS_CERTIFICATE_PASSWORD',\n    'MACOS_CERTIFICATE_BASE64',\n    'MACOS_CERTIFICATE_PASSWORD',\n    'MACOS_SIGN_IDENTITY',\n    'APPLE_API_KEY_BASE64',\n    'APPLE_API_KEY_ID',\n    'APPLE_API_ISSUER',\n  ]) {\n    if (workflowSource.includes(token)) {\n      errors.push('Release workflow must not use distribution signing credential: ' + token);\n    }\n  }\n"
text = replace_once(
    text,
    "  if (workflowSource.includes('single-work-release-gate.mjs')) {\n",
    insertion + "  if (workflowSource.includes('single-work-release-gate.mjs')) {\n",
    "forbid release signing credentials",
)
save(path, text)

# Desktop packager stable default becomes unsigned.
path = "scripts/package-desktop.mjs"
text = load(path)
text = replace_once(
    text,
    "  const distributionTrust =\n    option(argumentsList, '--distribution-trust') ??\n    (releaseKind === 'stable' ? 'required' : 'allow-unsigned');\n",
    "  const distributionTrust = option(argumentsList, '--distribution-trust') ?? 'allow-unsigned';\n",
    "package unsigned default",
)
text = replace_once(
    text,
    "  if (releaseKind === 'stable' && distributionTrust !== 'required') {\n    throw new Error('Stable packages must require distribution trust');\n  }\n\n",
    "",
    "remove stable package signing hard gate",
)
save(path, text)

# Package verifier accepts truthful stable unsigned manifests.
path = "scripts/verify-package-assets.mjs"
text = load(path)
text = replace_once(
    text,
    "  const trustMode = optionalOption(\n    argumentsList,\n    '--distribution-trust',\n    releaseKind === 'stable' ? 'required' : 'allow-unsigned',\n  );\n",
    "  const trustMode = optionalOption(argumentsList, '--distribution-trust', 'allow-unsigned');\n",
    "asset verifier unsigned default",
)
text = replace_once(
    text,
    "  if (releaseKind === 'stable' && trustMode !== 'required') {\n    throw new Error('Stable packages cannot allow unsigned distribution artifacts');\n  }\n",
    "",
    "remove stable asset signing hard gate",
)
save(path, text)

# Release CLI defaults follow the workflow policy.
path = "scripts/release-tool.mjs"
text = load(path)
old = "  const distributionTrust = readOption(\n    '--distribution-trust',\n    releaseKind === 'stable' ? 'required' : 'allow-unsigned',\n  );\n"
if text.count(old) != 2:
    raise SystemExit(f"release tool unsigned defaults: expected 2 matches, found {text.count(old)}")
text = text.replace(old, "  const distributionTrust = readOption('--distribution-trust', 'allow-unsigned');\n")
save(path, text)

# Unit tests.
path = "tests/unit/release-tool.test.ts"
text = load(path)
text = replace_once(
    text,
    "  'verify-package-assets.mjs',\n  'MACOS_CERTIFICATE_BASE64',\n  'WINDOWS_CERTIFICATE_BASE64',\n  'gh release create',\n",
    "  'verify-package-assets.mjs',\n  'DISTRIBUTION_TRUST_MODE: allow-unsigned',\n  'gh release create',\n",
    "release tool test workflow markers",
)
old_test = """  it('blocks version drift, non-main publication, and unsigned stable policy', () => {\n    const result = evaluateReleaseGate({\n      statuses: successStatuses,\n      packageVersion: '1.0.0',\n      requestedVersion: '1.0.1',\n      refName: 'feature',\n      releaseKind: 'stable',\n      distributionTrust: 'allow-unsigned',\n    });\n\n    expect(result.errors).toEqual(\n      expect.arrayContaining([\n        'Requested version 1.0.1 does not match package.json version 1.0.0',\n        'Releases may only run from main, found feature',\n        'Stable releases must require platform distribution trust',\n      ]),\n    );\n  });\n"""
new_test = """  it('blocks version drift and non-main publication while allowing unsigned stable releases', () => {\n    const result = evaluateReleaseGate({\n      statuses: successStatuses,\n      packageVersion: '1.0.0',\n      requestedVersion: '1.0.1',\n      refName: 'feature',\n      releaseKind: 'stable',\n      distributionTrust: 'allow-unsigned',\n    });\n\n    expect(result.errors).toEqual(\n      expect.arrayContaining([\n        'Requested version 1.0.1 does not match package.json version 1.0.0',\n        'Releases may only run from main, found feature',\n      ]),\n    );\n    expect(result.distributionTrust).toBe('allow-unsigned');\n  });\n"""
text = replace_once(text, old_test, new_test, "release gate stable unsigned test")
text = replace_once(
    text,
    "      distributionTrust: 'required',\n",
    "      distributionTrust: 'allow-unsigned',\n",
    "stable release acceptance input mode",
)
text = replace_once(
    text,
    "      distributionTrust: 'required',\n      errors: [],\n",
    "      distributionTrust: 'allow-unsigned',\n      errors: [],\n",
    "stable release expected mode",
)
text = replace_once(
    text,
    "    expect(\n      validateReleaseConfiguration({\n        packageJson,\n        workflowSource: releaseWorkflow + '\\nnode .github/governance/single-work-release-gate.mjs',\n      }),\n    ).toContain('Release workflow must not use Task Runtime as a release authority');\n",
    "    expect(\n      validateReleaseConfiguration({\n        packageJson,\n        workflowSource: releaseWorkflow + '\\nWINDOWS_CERTIFICATE_BASE64',\n      }),\n    ).toContain(\n      'Release workflow must not use distribution signing credential: WINDOWS_CERTIFICATE_BASE64',\n    );\n    expect(\n      validateReleaseConfiguration({\n        packageJson,\n        workflowSource: releaseWorkflow + '\\nnode .github/governance/single-work-release-gate.mjs',\n      }),\n    ).toContain('Release workflow must not use Task Runtime as a release authority');\n",
    "release config signing regression test",
)
save(path, text)

path = "tests/unit/package-desktop.test.ts"
text = load(path)
old_block = """    expect(() =>\n      parsePackageArguments(\n        ['--release-kind', 'stable', '--distribution-trust', 'allow-unsigned'],\n        {\n          packageVersion: '1.2.3',\n          nodePlatform: 'linux',\n          repositoryRoot,\n        },\n      ),\n    ).toThrow(/Stable packages must require distribution trust/);\n"""
text = replace_once(text, old_block, "", "remove unsigned stable rejection test")
marker = "  it('requires native trust evidence for stable Windows and macOS packages', () => {\n"
addition = """  it('allows stable packages to use unsigned self-use distribution mode', () => {\n    const repositoryRoot = path.resolve('/workspace/worldforge');\n    expect(\n      parsePackageArguments(['--release-kind', 'stable'], {\n        packageVersion: '1.2.3',\n        nodePlatform: 'linux',\n        repositoryRoot,\n      }),\n    ).toMatchObject({\n      releaseKind: 'stable',\n      distributionTrust: 'allow-unsigned',\n    });\n  });\n\n  it('keeps native trust verification for explicitly required packages', () => {\n"""
text = replace_once(text, marker, addition, "stable unsigned package test")
save(path, text)

# Active release documentation.
save(
    "docs/process/RELEASE_QUALIFICATION.md",
    """# WorldForge 发布资格判定规范

> 状态：Active  
> 适用范围：V1.0 三平台 GitHub Release 手工发布。  
> 更新日期：2026-08-20

## 1. 唯一发布权威

正式发布只由 `ReleaseAcceptance` 判定，权威输入为：

```text
当前 main 提交
├─ main-verification=success
├─ Release Quality / Security / Performance / UI Acceptance
├─ 三平台原生构建、启动冒烟与 package-manifest.json
└─ 三平台工件完整性
   ├─ 版本 / 架构 / 字节数 / SHA-256
   ├─ ASAR 与 Electron Fuses
   └─ 未签名状态与限制必须如实记录
```

`TASK_AUTHORIZATION.json`、`TASK_INDEX.md`、`docs/tasks/runtime/*.json` 和历史 `task-verification/*` 只用于项目管理与审计，不参与 Release 资格计算。

## 2. Source Authority

- 请求版本必须是严格 SemVer，且与 `package.json` 一致。
- Release 只能从 `main` 触发。
- 当前发布 SHA 必须拥有 `main-verification=success`。
- `release-acceptance.mjs` 只读取当前提交状态，不解析历史 Task Runtime。

## 3. Product Quality

每次 Release 必须执行：

- 完整 Quality；
- dependency audit、全历史 secret scan 和应用安全测试；
- Performance；
- UI Acceptance；
- Linux、Windows、macOS 三平台核心端到端；
- 三平台作者体验；
- Windows 原生中文输入法验收；
- 三平台原生打包与启动冒烟。

任一权威矩阵失败时，`publish` 不可运行。

## 4. Artifact Integrity

每个平台的 `package-manifest.json` 使用 Schema 2 并记录真实事实：

- 版本、平台、架构、工件名、字节数与 SHA-256；
- ASAR 及 header Hash；
- Electron Fuses；
- `releaseKind` 和 `distributionTrustMode`；
- `signed`、`notarized`、`stapled`；
- 若存在原生发行信任证据，则记录 `distributionTrustEvidence`。

平台 Job 生成后立即验证一次；发布 Job 下载三平台工件后再次验证，必须恰有 Linux、Windows、macOS 各一个 manifest，Hash 和字节数一致，随后才生成 `SHA256SUMS.txt`。

## 5. Distribution Trust

当前自用发布流程固定使用：

```text
DISTRIBUTION_TRUST_MODE=allow-unsigned
```

`draft`、`prerelease`、`stable` 均允许未签名。稳定版不再要求 Windows Authenticode，也不再要求 macOS Developer ID、Apple notarization 或 stapling。发布工作流不得读取代码签名证书或 Apple 公证凭据，也不得把缺少这些凭据视为发布失败。

未签名不是“已验证签名”的替代说法：manifest 必须如实记录 `signed: false`、`notarized: false`、`stapled: false`、`distributionTrustEvidence: null`，并保留未签名限制说明。

底层打包模块仍可保留显式 `required` 模式用于未来独立验证，但当前 GitHub Release 流程不会调用该模式。

## 6. Actions 凭据

当前发布流程不需要也不读取以下类别的凭据：

- Windows 代码签名证书；
- macOS Developer ID 证书；
- Apple 公证 API Key。

发布资格只依赖工程质量、当前主线权威状态、三平台真实测试与工件完整性。

## 7. 发布序列

```text
workflow_dispatch / 受控发布命令
→ Source Authority
→ Quality / Security / Performance / UI Acceptance
→ 三平台核心 E2E / 平台体验 / Windows IME
→ 三平台原生构建与 startup smoke
→ unsigned manifest 与工件 Hash 验证
→ 发布 Job 重新执行 Source Authority
→ 聚合复验三平台 manifest
→ SHA256SUMS
→ 创建不可覆盖的 GitHub Release
```

## 8. 维护规则

1. 新任务登记、状态变更或历史 Runtime 归档不得改变 Release 结果。
2. `allow-unsigned` 是当前自用发布的固定策略；若未来恢复签名，必须由作者新的明确指令重新启用，并同步工作流、纯函数单测与本规范。
3. manifest 不得伪造签名、公证或 stapling 状态。
4. 不得恢复旧 Task Runtime Release Gate 或新增第二套发布资格真源。
""",
)

save(
    "docs/product/SELF_USE_RELEASE_POLICY.md",
    """# WorldForge 自用发布策略

> 状态：Approved  
> 适用版本：V1.0  
> 生效日期：2026-08-20

## 1. 发布边界

WorldForge V1.0 仅供仓库所有者本人使用，不面向公众、客户、团队或第三方分发。

V1.0 交付形态为 Windows、macOS 和 Linux 自用便携包。用户自行下载、解压并启动，不提供商店分发、企业部署、系统安装器或自动更新承诺。

## 2. 必须满足

- 最终验收以 GitHub Actions 永久门禁和正式 Release 专项工作流结果为准。
- 三个平台均在对应 GitHub-hosted 原生 Runner 完成构建。
- 产物版本、架构、SHA-256、ASAR 完整性和 Electron Fuses 可验证。
- 三平台核心写作链路、平台体验、启动冒烟通过。
- Windows 原生中文输入法验收通过。
- 新版本便携包能够打开既有项目，Migration、备份和恢复边界保持有效。
- 程序目录与作者项目目录分离；替换或删除程序目录不得删除作品、数据库或备份。
- 未完成的 Actions 可执行项必须如实记录，不得把未执行验证标记为通过。

## 3. 自用候选与正式稳定版边界

`draft`、`prerelease`、`stable` 当前统一允许未签名。稳定版的含义是“通过全部工程、产品、三平台端到端和工件完整性门禁”，不再包含代码签名或 Apple 公证要求。

发布工作流固定使用 `allow-unsigned`。Windows 和 macOS 工件可以在 `stable` 中记录 `signed: false`；macOS 同时允许 `notarized: false`、`stapled: false`。这些字段必须真实，不得宣传为已签名或已公证。

## 4. 明确非目标

以下事项不属于 V1.0 自用发布完成条件：

- Windows Authenticode 代码签名和 SmartScreen 信誉积累。
- macOS Developer ID 签名、Apple notarization、stapling 和 Mac App Store 上架。
- MSI、MSIX、PKG、DMG 安装器或 Linux DEB/RPM 安装包。
- 安装、修复、覆盖升级、自动更新和卸载生命周期矩阵。
- 面向第三方的可信发布、企业部署或应用商店上架。
- GitHub Actions 无法真实复现的实体硬件、系统策略或第三方服务差异。

## 5. 使用限制

- Windows/macOS 未签名稳定包可能显示系统安全警告，需要仓库所有者本人确认并放行。
- `package-manifest.json` 和 Release 说明不得把未签名包描述为具有发行身份背书。
- Linux GitHub Actions 中的 CI 专用回退只证明自动化环境下功能链路通过，不代表所有 Linux 主机配置均已覆盖。
- 自用工件不得宣传为已签名、已公证、可公开分发或具备安装器生命周期保证。

## 6. 未来范围变化

若后续决定面向第三方公开推广，应另行恢复并设计代码签名、公证、安装器、升级卸载、渠道安全、隐私与真实用户环境验收；这些能力不属于当前自用稳定版发布门禁。
""",
)

print("Unsigned release policy patch prepared successfully.")
