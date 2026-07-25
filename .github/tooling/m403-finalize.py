from pathlib import Path
import subprocess

files = [
    'packages/contracts/src/provider.ts',
    'packages/contracts/src/error-codes.ts',
    'packages/contracts/src/index.ts',
    'packages/core-service/src/provider-errors.ts',
    'packages/core-service/src/provider-endpoint.ts',
    'packages/core-service/src/provider-adapters.ts',
    'packages/core-service/src/provider-connection.ts',
    'packages/core-service/src/utility-provider-router.ts',
    'packages/core-service/src/app-runtime.ts',
    'packages/core-service/src/utility-entry.ts',
    'packages/core-service/src/index.ts',
    'apps/desktop/main/src/core-supervisor.ts',
    'apps/desktop/main/src/ipc-handlers.ts',
    'apps/desktop/preload/src/index.ts',
    'apps/desktop/renderer/src/bridge/renderer-bridge-adapter.ts',
    'apps/desktop/renderer/src/shell/settings-navigation-model.ts',
    'apps/desktop/renderer/src/features/settings/provider-settings.tsx',
    'apps/desktop/renderer/src/features/settings/settings-page.tsx',
    'apps/desktop/renderer/src/app/app-shell-m3.tsx',
    'tests/unit/provider-contracts.test.ts',
    'tests/security/provider-endpoint.test.ts',
    'tests/security/provider-ipc.test.ts',
    'tests/integration/provider-connection.test.ts',
    'tests/e2e/provider-settings.spec.ts',
]
subprocess.run(['pnpm', 'exec', 'prettier', '--write', *files], check=True)
subprocess.run(['pnpm', 'test:prepare'], check=True)
subprocess.run(
    [
        'pnpm',
        'exec',
        'vitest',
        'run',
        'tests/unit/provider-contracts.test.ts',
        'tests/security/provider-endpoint.test.ts',
        'tests/security/provider-ipc.test.ts',
        'tests/integration/provider-connection.test.ts',
    ],
    check=True,
)
subprocess.run(['pnpm', 'typecheck'], check=True)
subprocess.run(['pnpm', 'lint'], check=True)
subprocess.run(['pnpm', 'build'], check=True)
subprocess.run(
    [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/provider-settings.spec.ts',
        '--config=tests/e2e/playwright.config.ts',
    ],
    check=True,
)
subprocess.run(['node', 'scripts/taskctl.mjs', 'validate'], check=True)
subprocess.run(['git', 'diff', '--check'], check=True)
subprocess.run(['git', 'add', '--all'], check=True)
subprocess.run(['git', 'commit', '-m', '功能：接通Provider配置凭据与连接测试'], check=True)
subprocess.run(['git', 'push', 'origin', 'HEAD:work/m4-03-provider-credential-connection'], check=True)
