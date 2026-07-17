import type { VersionCreateInput, WorldforgeBridge } from '@worldforge/contracts';

type RendererVersionCreateInput = Omit<VersionCreateInput, 'versionType'> & {
  readonly versionType?: VersionCreateInput['versionType'];
};

type RendererWorldforgeBridge = Omit<WorldforgeBridge, 'version'> & {
  readonly version: Omit<WorldforgeBridge['version'], 'create'> & {
    readonly create: (
      input: RendererVersionCreateInput,
    ) => ReturnType<WorldforgeBridge['version']['create']>;
  };
};

declare global {
  interface Window {
    readonly worldforge: RendererWorldforgeBridge;
  }
}

export {};
