from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    if text.count(old) != 1:
        raise SystemExit(f'{label}: target count {text.count(old)}')
    target.write_text(text.replace(old, new, 1))


replace_once(
    'packages/contracts/src/provider.ts',
    "    config: ProviderConfigInputSchema,\n    credential: z.string().min(1).max(32_768).nullable(),\n",
    "    config: ProviderConfigSchema,\n    credential: z.string().min(1).max(32_768).nullable(),\n",
    'core connection test requires stored provider',
)
replace_once(
    'packages/core-service/src/app-runtime.ts',
    "    providerConnections: new ProviderConnectionService({ clock: options.clock }),\n",
    "    providerConnections: new ProviderConnectionService({\n      ...(options.clock ? { clock: options.clock } : {}),\n    }),\n",
    'optional app runtime clock',
)
replace_once(
    'packages/core-service/src/provider-adapters.ts',
    "  ProviderEvent,\n  ProviderProtocol,\n} from '@worldforge/contracts';\n",
    "  ProviderEvent,\n} from '@worldforge/contracts';\n",
    'provider protocol import',
)
replace_once(
    'packages/core-service/src/provider-adapters.ts',
    "type JsonRecord = Record<string, unknown>;\n",
    "type ProviderProtocol = ProviderConfig['protocol'];\ntype JsonRecord = Record<string, unknown>;\n",
    'provider protocol local type',
)
replace_once(
    'packages/core-service/src/provider-connection.ts',
    "    const endpoint = await inspectProviderEndpoint(config.baseUrl, this.#options.lookup);\n    const provider = createProviderAdapter(config, credential, { fetch: this.#options.fetch });\n",
    "    const endpoint = this.#options.lookup\n      ? await inspectProviderEndpoint(config.baseUrl, this.#options.lookup)\n      : await inspectProviderEndpoint(config.baseUrl);\n    const provider = createProviderAdapter(config, credential, {\n      ...(this.#options.fetch ? { fetch: this.#options.fetch } : {}),\n    });\n",
    'optional provider dependencies',
)
