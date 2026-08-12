import { describe, expect, it } from 'vitest';

import { riskPlan } from '../../scripts/ci-risk-policy.mjs';
import { validateActiveDocumentation } from '../../scripts/documentation-consistency.mjs';
import { validateGovernanceAuthorities } from '../../scripts/governance-self-check.mjs';
import { validateLicenseMetadata } from '../../scripts/license-policy.mjs';

describe('统一风险矩阵', () => {
  it('Renderer变化触发产品、性能、安全、可靠性、UI、三平台体验和Windows IME风险', () => {
    expect(riskPlan(['apps/desktop/renderer/src/App.tsx'])).toMatchObject({
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

  it('治理文档维护保持轻量但进入Meta-Governance', () => {
    expect(riskPlan(['docs/process/CI_WORKFLOW_ARCHITECTURE.md'])).toMatchObject({
      fullSuite: false,
      dependencyAudit: false,
      applicationSecurity: false,
      performance: false,
      reliability: false,
      platformExperience: false,
      governanceMeta: true,
    });
  });

  it('三平台体验机器真源变化必须触发三平台原生Runner验证', () => {
    expect(riskPlan(['docs/process/PLATFORM_EXPERIENCE_MATRIX.json'])).toMatchObject({
      fullSuite: false,
      platformExperience: true,
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
      'name: quality / quality\nquality / release-audit\nquality / package-smoke\nci-risk-policy.mjs reliability\nci-risk-policy.mjs platform-experience\nname: platform-experience-${{ matrix.platform }}\nreliability_suite:',
    security: 'name: security',
    performance: 'name: performance',
    release:
      'node scripts/ui-acceptance-gate.mjs\npnpm release:gate\ntest "$GITHUB_REF_NAME" = main',
    mainVerification:
      'name: main-verification\nname: synchronize-integrations\nmain/work/governance branch inventory',
    riskPolicy:
      "CI_RISK_MATRIX.json export function riskPlan 'dependency-audit' reliability: 'reliability' 'windows-ime' 'platform-experience'",
    riskMatrix: JSON.stringify({
      schemaVersion: 1,
      routes: Object.fromEntries(
        [
          'dependencyAudit',
          'applicationSecurity',
          'performance',
          'reliability',
          'packageSmoke',
          'toolchainExport',
          'uiAcceptance',
          'windowsIme',
          'platformExperience',
          'governanceMeta',
        ].map((route) => [route, { any: [] }]),
      ),
    }),
    platformExperienceMatrix: JSON.stringify({
      schemaVersion: 1,
      status: 'enforced',
      platforms: [{ id: 'linux' }, { id: 'windows' }, { id: 'macos' }],
      scenario: { spec: 'tests/e2e/platform-experience.spec.ts' },
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

  it('三平台矩阵缺平台时阻断', () => {
    expect(
      validateGovernanceAuthorities({
        ...sources,
        platformExperienceMatrix: JSON.stringify({
          schemaVersion: 1,
          status: 'enforced',
          platforms: [{ id: 'linux' }, { id: 'windows' }],
          scenario: { spec: 'tests/e2e/platform-experience.spec.ts' },
        }),
      }),
    ).toContain('Platform experience matrix must require exactly linux, macos and windows');
  });
});
