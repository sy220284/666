import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const RENDERER_SCHEME = 'worldforge-app';
export const RENDERER_DOCUMENT_URL = `${RENDERER_SCHEME}://renderer/index.html`;
export const RENDERER_SCHEMES = [
  {
    scheme: RENDERER_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: false,
      allowServiceWorkers: false,
      supportFetchAPI: false,
      corsEnabled: false,
      stream: false,
      codeCache: true,
      allowExtensions: false,
    },
  },
] as const;

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

export function resolveRendererAsset(requestUrl: string, rendererRoot: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${RENDERER_SCHEME}:` || url.hostname !== 'renderer') return null;

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (decodedPath.includes('\0')) return null;
  const relativeAsset = decodedPath.replace(/^\/+/u, '');
  if (!relativeAsset || !contentTypes.has(path.extname(relativeAsset).toLowerCase())) return null;

  const canonicalRoot = path.resolve(rendererRoot);
  const assetPath = path.resolve(canonicalRoot, relativeAsset);
  const relative = path.relative(canonicalRoot, assetPath);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return assetPath;
}

export async function createRendererAssetResponse(
  requestUrl: string,
  rendererRoot: string,
): Promise<Response> {
  const assetPath = resolveRendererAsset(requestUrl, rendererRoot);
  if (!assetPath) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  try {
    const body = await readFile(assetPath);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentTypes.get(path.extname(assetPath).toLowerCase())!,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
