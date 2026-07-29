import { describe, expect, it } from 'vitest';

import { RequestGeneration } from '../../apps/desktop/renderer/src/runtime/request-generation.js';

describe('异步查询请求代次', () => {
  it('同一作品内后发请求使先发响应失效', () => {
    const requests = new RequestGeneration();
    const first = requests.begin();
    const second = requests.begin();
    expect(requests.isCurrent(first)).toBe(false);
    expect(requests.isCurrent(second)).toBe(true);
  });

  it('切换作品或卸载页面后使所有在途响应失效', () => {
    const requests = new RequestGeneration();
    const pending = requests.begin();
    requests.invalidate();
    expect(requests.isCurrent(pending)).toBe(false);
  });
});
