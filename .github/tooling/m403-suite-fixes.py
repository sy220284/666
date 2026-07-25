from pathlib import Path
import subprocess

TARGET_BRANCH = 'work/m4-03-provider-credential-connection'
EXPECTED_HEAD = '379b8518b9c2b753dd4e22392c4221be648ffb4b'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one target, found {count}')
    return text.replace(old, new, 1)


# Settings navigation now exposes five sections and Provider is an implemented section.
settings_test_path = Path('tests/unit/renderer-home-settings-taskbar.test.ts')
settings_test = settings_test_path.read_text()
settings_test = replace_once(
    settings_test,
    "  it('exposes only the four basic M3-08 settings sections', () => {",
    "  it('exposes the implemented Provider section alongside the basic settings sections', () => {",
    'settings navigation test title',
)
settings_test = replace_once(
    settings_test,
    """      currentSection: 'general',
    });

    expect(items.map((item) => item.id)).toEqual(SETTINGS_BASIC_SECTION_IDS);
""",
    """      currentSection: 'general',
      availability: { providers: true },
    });

    expect(items.map((item) => item.id)).toEqual(SETTINGS_BASIC_SECTION_IDS);
""",
    'settings Provider availability fixture',
)
settings_test_path.write_text(settings_test)

# Strict bridge fixture must include the new Provider namespace.
bridge_test_path = Path('tests/unit/renderer-m3-09-workbenches.test.ts')
bridge_test = bridge_test_path.read_text()
bridge_test = replace_once(
    bridge_test,
    """        app: {},
        settings: {},
        project: {},
""",
    """        app: {},
        settings: {},
        providers: {},
        project: {},
""",
    'strict Renderer Provider bridge fixture',
)
bridge_test_path.write_text(bridge_test)

# Use the exact DNS contract needed by endpoint inspection instead of node:dns overloads.
endpoint_path = Path('packages/core-service/src/provider-endpoint.ts')
endpoint = endpoint_path.read_text()
endpoint = replace_once(
    endpoint,
    "export type ProviderDnsLookup = typeof systemLookup;\n",
    """export interface ProviderResolvedAddress {
  readonly address: string;
  readonly family: number;
}

export type ProviderDnsLookup = (
  hostname: string,
  options: { readonly all: true; readonly verbatim: true },
) => Promise<readonly ProviderResolvedAddress[]>;
""",
    'Provider DNS lookup contract',
)
endpoint = replace_once(
    endpoint,
    "  lookup: ProviderDnsLookup = systemLookup,\n",
    "  lookup: ProviderDnsLookup = systemLookup as ProviderDnsLookup,\n",
    'system DNS lookup adaptation',
)
endpoint_path.write_text(endpoint)

# Endpoint tests now use fully typed lookup functions without unsafe escapes.
endpoint_test_path = Path('tests/security/provider-endpoint.test.ts')
endpoint_test = endpoint_test_path.read_text()
endpoint_test = replace_once(
    endpoint_test,
    """import {
  inspectProviderEndpoint,
  validateProviderEndpoint,
} from '../../packages/core-service/src/provider-endpoint.js';
""",
    """import {
  inspectProviderEndpoint,
  validateProviderEndpoint,
  type ProviderDnsLookup,
} from '../../packages/core-service/src/provider-endpoint.js';
""",
    'endpoint test DNS type import',
)
old_dns_test = """  it('blocks DNS answers that cross or change network trust boundaries', async () => {
    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', (async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ]) as never),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', (async () => [
        { address: '::ffff:127.0.0.1', family: 6 },
      ]) as never),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', (async () => [
        { address: '169.254.169.254', family: 4 },
      ]) as never),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
  });
"""
new_dns_test = """  it('blocks DNS answers that cross or change network trust boundaries', async () => {
    const mixedLookup: ProviderDnsLookup = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ];
    const loopbackLookup: ProviderDnsLookup = async () => [
      { address: '::ffff:127.0.0.1', family: 6 },
    ];
    const metadataLookup: ProviderDnsLookup = async () => [
      { address: '169.254.169.254', family: 4 },
    ];

    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', mixedLookup),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', loopbackLookup),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
    await expect(
      inspectProviderEndpoint('https://api.example.com/v1', metadataLookup),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
  });
"""
endpoint_test = replace_once(endpoint_test, old_dns_test, new_dns_test, 'typed endpoint DNS tests')
endpoint_test_path.write_text(endpoint_test)

# Integration test doubles implement the exact fetch and DNS interfaces; no baseline escape is needed.
integration_path = Path('tests/integration/provider-connection.test.ts')
integration = integration_path.read_text()
integration = replace_once(
    integration,
    "import { ProviderConnectionService } from '../../packages/core-service/src/provider-connection.js';\n",
    """import { ProviderConnectionService } from '../../packages/core-service/src/provider-connection.js';
import type { ProviderDnsLookup } from '../../packages/core-service/src/provider-endpoint.js';
""",
    'Provider integration DNS type import',
)
integration = replace_once(
    integration,
    "    const stalledFetch = async (): Promise<Response> =>\n",
    "    const stalledFetch: typeof fetch = async (): Promise<Response> =>\n",
    'typed stalled fetch',
)
integration = integration.replace('fetch: stalledFetch as typeof fetch', 'fetch: stalledFetch')
if integration.count('fetch: stalledFetch') != 2:
    raise SystemExit(f'stalled fetch usage count: {integration.count("fetch: stalledFetch")}')
integration = replace_once(
    integration,
    "    const lookup = (async () => [{ address: '93.184.216.34', family: 4 }]) as never;\n",
    """    const lookup: ProviderDnsLookup = async () => [
      { address: '93.184.216.34', family: 4 },
    ];
""",
    'typed Provider lookup',
)
integration = replace_once(
    integration,
    "    const timeoutFetch = async (_input: unknown, init?: RequestInit): Promise<Response> =>\n",
    "    const timeoutFetch: typeof fetch = async (_input, init): Promise<Response> =>\n",
    'typed timeout fetch',
)
integration = replace_once(
    integration,
    "new ProviderConnectionService({ lookup, fetch: timeoutFetch as typeof fetch })",
    "new ProviderConnectionService({ lookup, fetch: timeoutFetch })",
    'timeout fetch usage',
)
integration_path.write_text(integration)

files = [
    'tests/unit/renderer-home-settings-taskbar.test.ts',
    'tests/unit/renderer-m3-09-workbenches.test.ts',
    'packages/core-service/src/provider-endpoint.ts',
    'tests/security/provider-endpoint.test.ts',
    'tests/integration/provider-connection.test.ts',
]
subprocess.run(['pnpm', 'exec', 'prettier', '--write', *files], check=True)
subprocess.run(['pnpm', 'test:prepare'], check=True)
subprocess.run([
    'pnpm', 'exec', 'vitest', 'run',
    'tests/unit/renderer-home-settings-taskbar.test.ts',
    'tests/unit/renderer-m3-09-workbenches.test.ts',
    'tests/unit/test-quality-audit.test.ts',
    'tests/security/provider-endpoint.test.ts',
    'tests/integration/provider-connection.test.ts',
], check=True)
subprocess.run(['pnpm', 'typecheck'], check=True)
subprocess.run(['pnpm', 'lint'], check=True)
subprocess.run(['pnpm', 'test'], check=True)
subprocess.run(['node', 'scripts/taskctl.mjs', 'validate'], check=True)
subprocess.run(['git', 'diff', '--check'], check=True)
subprocess.run(['git', 'add', '--all'], check=True)
subprocess.run(['git', 'commit', '-m', '测试：同步M4-03设置桥接与类型质量基线'], check=True)
subprocess.run(['git', 'push', 'origin', f'HEAD:{TARGET_BRANCH}'], check=True)
