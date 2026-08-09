import { describe, expect, it } from 'vitest';

import { RequestGenerationGroup } from '../../apps/desktop/renderer/src/runtime/request-generation.js';

describe('全文搜索面板异步通道', () => {
  it('把等待状态绑定到对应通道的当前owner', () => {
    const requests = new RequestGenerationGroup<'dictionary-read' | 'dictionary-mutation'>();
    const mutation = requests.begin('dictionary-mutation');
    const read = requests.begin('dictionary-read');

    expect(requests.isActive('dictionary-mutation')).toBe(true);
    expect(requests.isActive('dictionary-read')).toBe(true);
    expect(requests.complete('dictionary-read', read)).toBe(true);
    expect(requests.isActive('dictionary-read')).toBe(false);
    expect(requests.isActive('dictionary-mutation')).toBe(true);
    expect(requests.complete('dictionary-mutation', mutation)).toBe(true);
    expect(requests.isActive('dictionary-mutation')).toBe(false);
  });

  it('旧响应不能结束新owner的等待状态', () => {
    const requests = new RequestGenerationGroup<'dictionary-mutation'>();
    const first = requests.begin('dictionary-mutation');
    const second = requests.begin('dictionary-mutation');

    expect(requests.complete('dictionary-mutation', first)).toBe(false);
    expect(requests.isActive('dictionary-mutation')).toBe(true);
    expect(requests.complete('dictionary-mutation', second)).toBe(true);
    expect(requests.isActive('dictionary-mutation')).toBe(false);
  });

  it('invalidate明确结束owner并使迟到响应失效', () => {
    const requests = new RequestGenerationGroup<'dictionary-mutation' | 'index'>();
    const mutation = requests.begin('dictionary-mutation');
    requests.begin('index');

    requests.invalidateAll();

    expect(requests.isActive('dictionary-mutation')).toBe(false);
    expect(requests.isActive('index')).toBe(false);
    expect(requests.isCurrent('dictionary-mutation', mutation)).toBe(false);
    expect(requests.complete('dictionary-mutation', mutation)).toBe(false);
  });
});
