import { describe, expect, it } from 'vitest';

import { bridgeResourceForQueryKey } from '../../apps/desktop/renderer/src/bridge/use-bridge-resource.js';

describe('M10-13 Bridge Resource上下文归属', () => {
  it('在queryKey切换后隐藏上一上下文的数据与错误', () => {
    const previous = {
      state: 'success' as const,
      data: { projectId: 'project-a' },
      error: null,
    };

    expect(bridgeResourceForQueryKey('recovery:project-b', 'recovery:project-a', previous)).toEqual(
      {
        state: 'loading',
        data: null,
        error: null,
      },
    );
  });

  it('只向匹配的queryKey提交已解析资源', () => {
    const current = {
      state: 'success' as const,
      data: { projectId: 'project-b' },
      error: null,
    };

    expect(bridgeResourceForQueryKey('recovery:project-b', 'recovery:project-b', current)).toBe(
      current,
    );
  });

  it('同一queryKey刷新时也先清除旧数据并进入真实loading', () => {
    const loading = {
      state: 'loading' as const,
      data: null,
      error: null,
    };
    expect(bridgeResourceForQueryKey('recovery:project-a', 'recovery:project-a', loading)).toBe(
      loading,
    );
  });
});
