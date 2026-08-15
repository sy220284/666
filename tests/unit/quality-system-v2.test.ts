import { describe, expect, it } from 'vitest';

import { riskPlan } from '../../scripts/ci-risk-policy.mjs';
import { validateActiveDocumentation } from '../../scripts/documentation-consistency.mjs';
import { validateGovernanceAuthorities } from '../../scripts/governance-self-check.mjs';
import { validateLicenseMetadata } from '../../scripts/license-policy.mjs';

const platformExperienceViewports = [
  { id: 'baseline-qhd', width: 2560, height: 1440 },
  { id: 'laptop-qhd-plus', width: 2560, height: 1600 },
  { id: 'ultrawide-uwqhd', width: 3440, height: 1440 },
  { id: 'high-end-4k', width: 3840, height: 2160 },
];

describe('统一风险矩阵', () => {
  it('正文编辑器变化触发产品、性能、安全、可靠性、UI、三平台体验和Windows IME风险', () => {
    expect(
      riskPlan(['apps/desktop/renderer/src/features/writing/writing-workbench-view.tsx']),
    ).toMatchObject({
      fullSuite: true,
      dependencyAudit: false,
      applicationSecurity: true,
      performance: true,
      reliability: true,
      uiAcceptance: true,
      windowsIme: true,
      platformExperience: true,
    });
  });

  it('普通规划页面仍跑产品质量但不启动Windows IME和三平台体验', () => {
    expect(
      riskPlan(['apps/desktop/renderer/src/features/planning/idea-capsule-panel.tsx']),
    ).toMatchObject({
      fullSuite: true,
      applicationSecurity: true,
      performance: true,
      reliability: true,
      uiAcceptance: true,
      windowsIme: false,
      platformExperience: false,
    });
  });

  it('治理文档维护保持轻量但进入Meta-Governance与Release Audit', () => {
    expect(riskPlan(['docs/process/CI_WORKFLOW_ARCHITECTURE.md'])).toMatchObject({
      fullSuite: false,
      dependencyAudit: false,
      applicationSecurity: false,
      performance: false,
      reliability: false,
      platformExperience: false,
      releaseAudit: true,
      governanceMeta: true,
    });
  });

  it('三平台体验机器真源变化必须触发三平台原生Runner验证', () => {
    expect(riskPlan(['docs/process/PLATFORM_EXPERIENCE_MATRIX.json'])).toMatchObject({
      fullSuite: false,
      platformExperience: true,
      releaseAudit: true,
      governanceMeta: true,
    });
  });

  it('可靠性测试和核心运行时代码变化触发Reliability', () => {
    expect(riskPlan(['tests/reliability/file-lease-stress.test.ts'])).toMatchObject({
      fullSuite: true,
      reliability: true,
    });
    expect(riskPlan(['packages/core-service/src/recovery/file-lease.ts'])).toMatchObject({
      fullSuite: true,
      reliability: true,
    });
  });

  it('依赖元数据变化触发完整质量、供应链、打包、三平台体验和工具链验证', () => {
    expect(riskPlan(['package.json'])).toMatchObject({
      fullSuite: true,
      packageSmoke: true,
      toolchainExport: true,
      dependencyAudit: true,
      applicationSecurity: true,
      performance: true,
      reliability: true,
      platformExperience: true,
      releaseAudit: true,
      governanceMeta: true,
    });
  });
});

describe('许可证权威', () => {
  it('MIT LICENSE与package SPDX一致时通过', () => {
    expect(
      validateLicenseMetadata({
        packageJson: { license: 'MIT' },
        licenseSource: 'MIT License\n\nCopyright (c) 2026',
      }),
    ).toEqual([]);
  });

  it('重新引入AGPL元数据时阻断', () => {
    expect(
      validateLicenseMetadata({
        packageJson: { license: 'AGPL-3.0-only' },
        licenseSource: 'MIT License\n',
      }),
    ).toContain('package.json license must be MIT, found AGPL-3.0-only');
  });
});

describe('Active文档一致性', () => {
  const current = {
    execution:
      'main/work/governance pr-policy quality / quality security performance Release不读取任务Runtime作为产品发布权威 ACTIVE_TASK.json 已经退役',
    ci: '稳定`main` + 产品`work` + 治理`governance` pr-policy quality / quality security performance Integration Branch Synchronization',
    release:
      'ReleaseAcceptance main-verification=success UI Acceptance Windows Authenticode macOS Developer ID 不得恢复旧Task Runtime Release Gate',
    readme: 'License: MIT License',
  };

  it('当前三分支、四Context与Release权威文档通过', () => {
    expect(validateActiveDocumentation(current)).toEqual([]);
  });

  it('两分支旧文档会被识别', () => {
    expect(
      validateActiveDocumentation({
        ...current,
        ci: `${current.ci}\n固定分支仅允许\`main\`、\`work\`。`,
      }),
    ).toContain('CI documentation still declares the retired two-branch inventory');
  });

  it('README重新声明退役AGPL元数据时阻断', () => {
    expect(
      validateActiveDocumentation({
        ...current,
        readme: `${current.readme}\npackage.json: AGPL-3.0-only`,
      }),
    ).toContain('README still declares the retired AGPL-3.0-only package metadata');
  });
});

describe('Meta-Governance权威链', () => {
  const sources = {
    quality:
      'name: quality / quality\nquality / release-audit\nci-risk-policy.mjs reliability\nci-risk-policy.mjs platform-experience\nci-risk-policy.mjs release-audit\nname: windows-experience\nplatform-experience-macos\nlinux_platform_experience:\nreliability_suite:',
    security:
      'name: security-route\nsupply-chain-inventory:\nnode scripts/supply-chain-inventory.mjs\nscan-secrets.mjs --base\nscan-secrets.mjs --history\nname: security',
    performance: 'name: performance\nRun AI protocol baselines and performance budgets',
    release:
      'node scripts/ui-acceptance-gate.mjs\npnpm release:gate\ntest "$GITHUB_REF_NAME" = main',
    mainVerification: 'name: main-verification\nname: synchronize-integrations\ntree identity',
    riskPolicy:
      "CI_RISK_MATRIX.json export function riskPlan 'dependency-audit' 'supply-chain-inventory' reliability: 'reliability' 'windows-ime' 'platform-experience' 'release-audit'",
    riskMatrix: JSON.stringify({
      schemaVersion: 1,
      routes: Object.fromEntries(
        [
          'dependencyAudit',
          'supplyChainInventory',
          'applicationSecurity',
          'performance',
          'reliability',
          'packageSmoke',
          'toolchainExport',
          'uiAcceptance',
          'windowsIme',
          'platformExperience',
          'releaseAudit',
          'governanceMeta',
        ].map((route) => [route, { any: [] }]),
      ),
    }),
    platformExperienceMatrix: JSON.stringify({
      schemaVersion: 2,
      status: 'enforced',
      platforms: [{ id: 'linux' }, { id: 'windows' }, { id: 'macos' }],
      scenario: {
        spec: 'tests/e2e/platform-experience.spec.ts',
        viewports: platformExperienceViewports,
      },
    }),
    supplyChainInventoryPolicy: JSON.stringify({
      schemaVersion: 1,
      status: 'enforced',
      sbom: { format: 'cyclonedx', specVersion: '1.7' },
      licenses: { sourceCommand: 'pnpm licenses list --json' },
    }),
  };

  it('关键权威链全部存在时通过', () => {
    expect(validateGovernanceAuthorities(sources)).toEqual([]);
  });

  it('Release丢失UI gate时阻断', () => {
    expect(
      validateGovernanceAuthorities({
        ...sources,
        release: 'pnpm release:gate\ntest "$GITHUB_REF_NAME" = main',
      }),
    ).toContain('Release is missing authority marker: node scripts/ui-acceptance-gate.mjs');
  });

  it('Security丢失供应链Inventory入口时阻断', () => {
    expect(
      validateGovernanceAuthorities({
        ...sources,
        security:
          'name: security-route\nscan-secrets.mjs --base\nscan-secrets.mjs --history\nname: security',
      }),
    ).toContain('Security is missing authority marker: supply-chain-inventory:');
  });

  it('供应链策略退出enforced时阻断', () => {
    expect(
      validateGovernanceAuthorities({
        ...sources,
        supplyChainInventoryPolicy: JSON.stringify({
          schemaVersion: 1,
          status: 'planned',
          sbom: { format: 'cyclonedx', specVersion: '1.7' },
          licenses: { sourceCommand: 'pnpm licenses list --json' },
        }),
      }),
    ).toContain('Supply-chain inventory policy must be enforced');
  });

  it('三平台矩阵缺平台时阻断', () => {
    expect(
      validateGovernanceAuthorities({
        ...sources,
        platformExperienceMatrix: JSON.stringify({
          schemaVersion: 2,
          status: 'enforced',
          platforms: [{ id: 'linux' }, { id: 'windows' }],
          scenario: {
            spec: 'tests/e2e/platform-experience.spec.ts',
            viewports: platformExperienceViewports,
          },
        }),
      }),
    ).toContain('Platform experience matrix must require exactly linux, macos and windows');
  });

  it('三平台矩阵重新引入FHD或更低物理分辨率时阻断', () => {
    expect(
      validateGovernanceAuthorities({
        ...sources,
        platformExperienceMatrix: JSON.stringify({
          schemaVersion: 2,
          status: 'enforced',
          platforms: [{ id: 'linux' }, { id: 'windows' }, { id: 'macos' }],
          scenario: {
            spec: 'tests/e2e/platform-experience.spec.ts',
            viewports: [
              { id: 'legacy-fhd', width: 1920, height: 1080 },
              ...platformExperienceViewports,
            ],
          },
        }),
      }),
    ).toContain(
      'Platform experience matrix must require exactly 2560x1440, 2560x1600, 3440x1440 and 3840x2160 viewports',
    );
  });
});
