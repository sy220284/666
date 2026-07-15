export interface PreventableEvent {
  preventDefault(): void;
}

export interface NavigationWebContents {
  on(
    event: 'will-navigate',
    listener: (event: PreventableEvent, navigationUrl: string) => void,
  ): void;
  setWindowOpenHandler(
    handler: (details: { readonly url: string }) => { readonly action: 'deny' },
  ): void;
  readonly session: {
    on(event: 'will-download', listener: (event: PreventableEvent) => void): void;
  };
}

export type OpenExternal = (url: string) => Promise<void>;

export function isExternalWebUrl(rawUrl: string): boolean {
  try {
    const protocol = new URL(rawUrl).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function installNavigationPolicy(
  webContents: NavigationWebContents,
  applicationUrl: string,
  openExternal: OpenExternal,
): void {
  const openAllowedExternal = (url: string): void => {
    if (!isExternalWebUrl(url)) return;
    void openExternal(url).catch(() => undefined);
  };

  webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl === applicationUrl) return;
    event.preventDefault();
    openAllowedExternal(navigationUrl);
  });

  webContents.setWindowOpenHandler(({ url }) => {
    openAllowedExternal(url);
    return { action: 'deny' };
  });

  webContents.session.on('will-download', (event) => {
    event.preventDefault();
  });
}
